import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  assertRunId,
  type RunId,
} from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import {
  assertCanonicalDescendant,
  assertSafeRoot,
  isStrictDescendant,
  readRegularFileNoFollow,
} from "./safety.js";
import { WorktreeManager, type WorktreeRecord } from "./worktrees.js";

export interface CleanupTarget {
  readonly kind: "worktree" | "artifacts" | "cache";
  readonly path: string;
  readonly estimatedBytes: number;
  readonly ownership: string;
}
export interface CleanupPlan {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly dryRun: true;
  readonly stateRoot: string;
  readonly runId?: RunId;
  readonly targets: readonly CleanupTarget[];
}
export interface CleanupResult {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly confirmed: boolean;
  readonly targets: readonly CleanupTarget[];
  readonly removed: readonly string[];
}

async function sizeWithoutFollowing(path: string): Promise<number> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) return info.size;
  let total = info.size;
  for (const entry of await readdir(path))
    total += await sizeWithoutFollowing(resolve(path, entry));
  return total;
}

async function optionalWorktreeRecords(
  runRoot: string,
): Promise<readonly WorktreeRecord[]> {
  try {
    const parsed = JSON.parse(
      (
        await readRegularFileNoFollow(
          resolve(runRoot, "local", "worktrees.json"),
          "local/worktrees.json",
        )
      ).toString("utf8"),
    ) as { worktrees?: WorktreeRecord[] };
    return parsed.worktrees ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function inspectCacheOwner(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new PatchRaceError({
      code: "CLEANUP_CACHE_ENTRY_UNSAFE",
      category: "SAFETY",
      message: "Cache cleanup target must be a real owned directory.",
      path,
    });
  }
  let owner: { schemaVersion?: string; kind?: string; cacheKey?: string };
  try {
    owner = JSON.parse(
      (
        await readRegularFileNoFollow(
          resolve(path, ".patchrace-cache-owner.json"),
          ".patchrace-cache-owner.json",
        )
      ).toString("utf8"),
    ) as typeof owner;
  } catch (error) {
    throw new PatchRaceError(
      {
        code: "CLEANUP_CACHE_OWNERSHIP_MISSING",
        category: "SAFETY",
        message:
          "Cache entry has no readable PatchRace ownership record; retaining it.",
        path,
      },
      { cause: error },
    );
  }
  if (
    owner.schemaVersion !== SCHEMA_VERSION ||
    owner.kind !== "patchrace-cache-entry" ||
    owner.cacheKey !== basename(path)
  ) {
    throw new PatchRaceError({
      code: "CLEANUP_CACHE_OWNERSHIP_INVALID",
      category: "SAFETY",
      message:
        "Cache ownership record does not match the exact entry; retaining it.",
      path,
    });
  }
}

export async function planRunCleanup(options: {
  readonly stateRoot: string;
  readonly runId: string;
  readonly includeWorktrees?: boolean;
  readonly includeArtifacts?: boolean;
}): Promise<CleanupPlan> {
  assertRunId(options.runId);
  const stateRoot = await realpath(
    assertSafeRoot(options.stateRoot, "stateRoot"),
  );
  const runRoot = resolve(stateRoot, "runs", options.runId);
  if (!isStrictDescendant(stateRoot, runRoot))
    throw new PatchRaceError({
      code: "CLEANUP_PATH_UNSAFE",
      category: "SAFETY",
      message: "Run cleanup path escapes the state root.",
      path: "runId",
    });
  const owner = await ArtifactStore.inspectOwner(runRoot);
  if (owner.runId !== options.runId)
    throw new PatchRaceError({
      code: "CLEANUP_OWNERSHIP_MISMATCH",
      category: "SAFETY",
      message: "Run ownership does not match cleanup request.",
      path: "runId",
    });
  const targets: CleanupTarget[] = [];
  if (options.includeWorktrees === true) {
    for (const record of await optionalWorktreeRecords(runRoot)) {
      if (
        record.runId !== options.runId ||
        !isStrictDescendant(
          resolve(stateRoot, "worktrees", options.runId),
          record.path,
        )
      )
        throw new PatchRaceError({
          code: "CLEANUP_WORKTREE_RECORD_UNSAFE",
          category: "SAFETY",
          message: "Recorded worktree is outside the exact run worktree root.",
          path: "local/worktrees.json",
        });
      targets.push({
        kind: "worktree",
        path: record.path,
        estimatedBytes: await sizeWithoutFollowing(record.path),
        ownership: `${record.runId}/${record.trialId}@${record.baselineCommit}`,
      });
    }
  }
  if (options.includeArtifacts === true)
    targets.push({
      kind: "artifacts",
      path: runRoot,
      estimatedBytes: await sizeWithoutFollowing(runRoot),
      ownership: owner.runId,
    });
  return {
    schemaVersion: SCHEMA_VERSION,
    dryRun: true,
    stateRoot,
    runId: options.runId,
    targets,
  };
}

export async function planCacheCleanup(options: {
  readonly stateRoot: string;
  readonly olderThanMs: number;
  readonly now?: () => number;
}): Promise<CleanupPlan> {
  if (!Number.isFinite(options.olderThanMs) || options.olderThanMs < 0)
    throw new PatchRaceError({
      code: "CLEANUP_AGE_INVALID",
      category: "CONFIG",
      message: "Cache cleanup age must be finite and non-negative.",
      path: "olderThan",
    });
  const stateRoot = await realpath(
    assertSafeRoot(options.stateRoot, "stateRoot"),
  );
  const cacheRoot = resolve(stateRoot, "cache");
  let entries;
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        schemaVersion: SCHEMA_VERSION,
        dryRun: true,
        stateRoot,
        targets: [],
      };
    throw error;
  }
  const cutoff = (options.now ?? Date.now)() - options.olderThanMs;
  const targets: CleanupTarget[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(cacheRoot, entry.name);
    if (!isStrictDescendant(cacheRoot, path) || entry.isSymbolicLink())
      throw new PatchRaceError({
        code: "CLEANUP_CACHE_ENTRY_UNSAFE",
        category: "SAFETY",
        message: "Cache entry is a symlink or escapes the cache root.",
        path: entry.name,
      });
    const info = await lstat(path);
    if (info.mtimeMs <= cutoff) {
      await inspectCacheOwner(path);
      targets.push({
        kind: "cache",
        path,
        estimatedBytes: await sizeWithoutFollowing(path),
        ownership: `cache/${entry.name}`,
      });
    }
  }
  return { schemaVersion: SCHEMA_VERSION, dryRun: true, stateRoot, targets };
}

export async function executeCleanup(
  plan: CleanupPlan,
  options: { readonly confirm?: boolean } = {},
): Promise<CleanupResult> {
  if (options.confirm !== true)
    return {
      schemaVersion: SCHEMA_VERSION,
      confirmed: false,
      targets: plan.targets,
      removed: [],
    };
  const removed: string[] = [];
  const runRoot =
    plan.runId === undefined
      ? null
      : resolve(plan.stateRoot, "runs", plan.runId);
  if (runRoot !== null) {
    const owner = await ArtifactStore.inspectOwner(runRoot);
    if (owner.runId !== plan.runId)
      throw new PatchRaceError({
        code: "CLEANUP_OWNERSHIP_CHANGED",
        category: "SAFETY",
        message:
          "Run ownership changed after cleanup planning; retaining all targets.",
        path: runRoot,
      });
  }
  const worktreeRecords =
    runRoot === null ? [] : await optionalWorktreeRecords(runRoot);
  const preparedWorktrees: {
    readonly target: CleanupTarget;
    readonly record: WorktreeRecord;
    readonly manager: WorktreeManager;
  }[] = [];
  for (const target of plan.targets.filter(({ kind }) => kind === "worktree")) {
    const record = worktreeRecords.find(({ path }) => path === target.path);
    if (record === undefined)
      throw new PatchRaceError({
        code: "CLEANUP_WORKTREE_UNRECORDED",
        category: "SAFETY",
        message:
          "Cleanup target is not present in the immutable worktree record.",
        path: target.path,
      });
    const expectedOwnership = `${record.runId}/${record.trialId}@${record.baselineCommit}`;
    if (target.ownership !== expectedOwnership)
      throw new PatchRaceError({
        code: "CLEANUP_WORKTREE_OWNERSHIP_CHANGED",
        category: "SAFETY",
        message:
          "Worktree ownership changed after cleanup planning; retaining all targets.",
        path: target.path,
      });
    const manager = await WorktreeManager.open(
      record.repositoryRoot,
      plan.stateRoot,
    );
    preparedWorktrees.push({ target, record, manager });
  }

  // Validate every non-worktree target before deleting any worktree. This keeps
  // a stale or swapped cleanup plan from partially applying before it fails.
  for (const target of plan.targets.filter(({ kind }) => kind !== "worktree")) {
    await assertCanonicalDescendant(plan.stateRoot, target.path);
    const info = await lstat(target.path);
    if (info.isSymbolicLink())
      throw new PatchRaceError({
        code: "CLEANUP_SYMLINK_ROOT_REFUSED",
        category: "SAFETY",
        message: "Cleanup target root is a symlink; refusing deletion.",
        path: target.path,
      });
    if (target.kind === "artifacts") {
      if (runRoot === null || resolve(target.path) !== runRoot)
        throw new PatchRaceError({
          code: "CLEANUP_ARTIFACT_TARGET_MISMATCH",
          category: "SAFETY",
          message:
            "Artifact cleanup target is not the exact requested run root.",
          path: target.path,
        });
      const owner = await ArtifactStore.inspectOwner(target.path);
      if (owner.runId !== plan.runId || target.ownership !== plan.runId)
        throw new PatchRaceError({
          code: "CLEANUP_OWNERSHIP_CHANGED",
          category: "SAFETY",
          message:
            "Run ownership changed after cleanup planning; retaining all targets.",
          path: target.path,
        });
    } else if (
      !isStrictDescendant(resolve(plan.stateRoot, "cache"), target.path)
    ) {
      throw new PatchRaceError({
        code: "CLEANUP_CACHE_TARGET_MISMATCH",
        category: "SAFETY",
        message: "Cache cleanup target is outside the exact cache root.",
        path: target.path,
      });
    } else {
      await inspectCacheOwner(target.path);
      if (target.ownership !== `cache/${basename(target.path)}`)
        throw new PatchRaceError({
          code: "CLEANUP_CACHE_OWNERSHIP_CHANGED",
          category: "SAFETY",
          message:
            "Cache ownership changed after cleanup planning; retaining all targets.",
          path: target.path,
        });
    }
  }

  for (const { target, record, manager } of preparedWorktrees) {
    await manager.cleanup(record, { confirm: true, allowDirty: true });
    removed.push(target.path);
  }
  for (const target of plan.targets.filter(({ kind }) => kind !== "worktree")) {
    await rm(target.path, { recursive: true, force: false });
    removed.push(target.path);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    confirmed: true,
    targets: plan.targets,
    removed,
  };
}
