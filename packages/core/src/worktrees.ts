import { lstat, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  PatchRaceError,
  assertRunId,
  assertTrialId,
  type RunId,
  type TrialId,
} from "@patchrace/contracts";

import { runProcess } from "./process.js";
import {
  assertCanonicalDescendant,
  assertSafeRoot,
  ensureOwnedDirectory,
  isStrictDescendant,
} from "./safety.js";

export interface WorktreeRecord {
  readonly schemaVersion: "1.0.0";
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly path: string;
  readonly runId: RunId;
  readonly trialId: TrialId;
  readonly baselineCommit: string;
  readonly createdAt: string;
}

export interface WorktreeCleanupResult {
  readonly removed: boolean;
  readonly path: string;
  readonly dirty: boolean;
}

const locks = new Map<string, Promise<void>>();

async function serialized<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => {
    release = resolveRelease;
  });
  const queued = prior.then(() => current);
  locks.set(key, queued);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

async function git(
  repositoryRoot: string,
  args: readonly string[],
): Promise<string> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args: ["-C", repositoryRoot, ...args],
    cwd: repositoryRoot,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL"],
    maxOutputBytes: 4 * 1024 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
    timeoutMs: 30_000,
  });
  if (result.status !== "completed") {
    const diagnostic = Buffer.concat(stderr)
      .toString("utf8")
      .trim()
      .slice(0, 500);
    throw new PatchRaceError({
      code: "GIT_COMMAND_FAILED",
      category: "EXECUTION",
      message: `Git command failed (${args[0] ?? "unknown"})${diagnostic ? `: ${diagnostic}` : "."}`,
      retryable: false,
    });
  }
  return Buffer.concat(stdout).toString("utf8");
}

interface GitWorktree {
  readonly path: string;
  readonly head: string | null;
}

function parseWorktrees(output: string): readonly GitWorktree[] {
  const records: GitWorktree[] = [];
  let current: { path?: string; head?: string } = {};
  for (const field of output.split("\0")) {
    if (field === "") {
      if (current.path !== undefined)
        records.push({ path: current.path, head: current.head ?? null });
      current = {};
    } else if (field.startsWith("worktree "))
      current.path = field.slice("worktree ".length);
    else if (field.startsWith("HEAD "))
      current.head = field.slice("HEAD ".length);
  }
  if (current.path !== undefined)
    records.push({ path: current.path, head: current.head ?? null });
  return records;
}

export class WorktreeManager {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;

  private constructor(repositoryRoot: string, worktreeRoot: string) {
    this.repositoryRoot = repositoryRoot;
    this.worktreeRoot = worktreeRoot;
  }

  static async open(
    repositoryRoot: string,
    stateRoot: string,
  ): Promise<WorktreeManager> {
    const canonicalRepository = await realpath(repositoryRoot).catch(
      (error: unknown) => {
        throw new PatchRaceError(
          {
            code: "GIT_REPOSITORY_MISSING",
            category: "PREFLIGHT",
            message: "Repository root does not exist.",
            path: "repositoryRoot",
          },
          { cause: error },
        );
      },
    );
    const reportedRoot = (
      await git(canonicalRepository, ["rev-parse", "--show-toplevel"])
    ).trim();
    const canonicalReported = await realpath(reportedRoot);
    if (canonicalReported !== canonicalRepository) {
      throw new PatchRaceError({
        code: "GIT_ROOT_MISMATCH",
        category: "SAFETY",
        message: "Configured repository root is not the Git top-level.",
        path: "repositoryRoot",
      });
    }
    const safeState = assertSafeRoot(stateRoot, "stateRoot");
    await ensureOwnedDirectory(safeState, ".");
    const canonicalState = await realpath(safeState);
    if (!isStrictDescendant(canonicalRepository, canonicalState)) {
      throw new PatchRaceError({
        code: "WORKTREE_STATE_ROOT_UNSAFE",
        category: "SAFETY",
        message: "Worktree state root must be inside the repository root.",
        path: "stateRoot",
      });
    }
    const worktreeRoot = await ensureOwnedDirectory(
      canonicalState,
      "worktrees",
    );
    return new WorktreeManager(canonicalRepository, worktreeRoot);
  }

  async list(): Promise<readonly GitWorktree[]> {
    return parseWorktrees(
      await git(this.repositoryRoot, ["worktree", "list", "--porcelain", "-z"]),
    );
  }

  async create(options: {
    readonly runId: RunId;
    readonly trialId: TrialId;
    readonly commit: string;
    readonly now?: () => Date;
  }): Promise<WorktreeRecord> {
    assertRunId(options.runId);
    assertTrialId(options.trialId);
    return serialized(this.repositoryRoot, async () => {
      const commit = (
        await git(this.repositoryRoot, [
          "rev-parse",
          "--verify",
          `${options.commit}^{commit}`,
        ])
      ).trim();
      if (!/^[a-f0-9]{40}$/i.test(commit))
        throw new PatchRaceError({
          code: "GIT_COMMIT_INVALID",
          category: "PREFLIGHT",
          message: "Baseline did not resolve to one full commit.",
          path: "commit",
        });
      const runDirectory = await ensureOwnedDirectory(
        this.worktreeRoot,
        options.runId,
      );
      const target = resolve(runDirectory, options.trialId);
      await assertCanonicalDescendant(this.worktreeRoot, target);
      if (
        (await this.list()).some(
          (worktree) => resolve(worktree.path) === target,
        )
      ) {
        throw new PatchRaceError({
          code: "WORKTREE_COLLISION",
          category: "CONFLICT",
          message: "Git already records the requested worktree path.",
          path: "trialId",
        });
      }
      try {
        await lstat(target);
        throw new PatchRaceError({
          code: "WORKTREE_PATH_EXISTS",
          category: "CONFLICT",
          message: "Requested worktree path already exists.",
          path: "trialId",
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await git(this.repositoryRoot, [
        "worktree",
        "add",
        "--detach",
        target,
        commit,
      ]);
      const actual = (await this.list()).find(
        (worktree) => resolve(worktree.path) === target,
      );
      if (actual?.head?.toLowerCase() !== commit.toLowerCase()) {
        throw new PatchRaceError({
          code: "WORKTREE_POSTCONDITION_FAILED",
          category: "CONFLICT",
          message:
            "Created worktree does not match its recorded commit; it was retained for inspection.",
          path: "commit",
        });
      }
      return {
        schemaVersion: "1.0.0",
        repositoryRoot: this.repositoryRoot,
        worktreeRoot: this.worktreeRoot,
        path: target,
        runId: options.runId,
        trialId: options.trialId,
        baselineCommit: commit.toLowerCase(),
        createdAt: (options.now ?? (() => new Date()))().toISOString(),
      };
    });
  }

  async cleanup(
    record: WorktreeRecord,
    options: { readonly confirm?: boolean; readonly allowDirty?: boolean } = {},
  ): Promise<WorktreeCleanupResult> {
    return serialized(this.repositoryRoot, async () => {
      this.assertOwned(record);
      if (options.confirm !== true)
        return {
          removed: false,
          path: record.path,
          dirty: await this.isDirty(record.path),
        };
      await assertCanonicalDescendant(this.worktreeRoot, record.path);
      const actual = (await this.list()).find(
        (worktree) => resolve(worktree.path) === resolve(record.path),
      );
      if (
        actual === undefined ||
        actual.head?.toLowerCase() !== record.baselineCommit.toLowerCase()
      ) {
        throw new PatchRaceError({
          code: "WORKTREE_OWNERSHIP_CONFLICT",
          category: "CONFLICT",
          message:
            "Git worktree ownership no longer matches the recorded path and commit; retaining it.",
          path: "path",
        });
      }
      const dirty = await this.isDirty(record.path);
      if (dirty && options.allowDirty !== true) {
        throw new PatchRaceError({
          code: "WORKTREE_DIRTY_RETAINED",
          category: "CONFLICT",
          message:
            "Worktree contains changes; capture evidence and explicitly allow dirty cleanup.",
          path: "path",
          remediation:
            "Finalize the patch artifact, then retry cleanup with explicit dirty-worktree approval.",
        });
      }
      await git(this.repositoryRoot, [
        "worktree",
        "remove",
        ...(dirty ? ["--force"] : []),
        record.path,
      ]);
      if (
        (await this.list()).some(
          (worktree) => resolve(worktree.path) === resolve(record.path),
        )
      ) {
        throw new PatchRaceError({
          code: "WORKTREE_REMOVE_POSTCONDITION_FAILED",
          category: "CONFLICT",
          message:
            "Git still records the worktree after cleanup; retaining remaining state.",
          path: "path",
        });
      }
      return { removed: true, path: record.path, dirty };
    });
  }

  private assertOwned(record: WorktreeRecord): void {
    if (
      record.repositoryRoot !== this.repositoryRoot ||
      record.worktreeRoot !== this.worktreeRoot ||
      !isStrictDescendant(this.worktreeRoot, record.path)
    ) {
      throw new PatchRaceError({
        code: "WORKTREE_RECORD_UNSAFE",
        category: "SAFETY",
        message: "Worktree record does not belong to this manager.",
        path: "record",
      });
    }
    const expected = resolve(this.worktreeRoot, record.runId, record.trialId);
    if (
      resolve(record.path) !== expected ||
      relative(this.worktreeRoot, record.path).startsWith("..")
    ) {
      throw new PatchRaceError({
        code: "WORKTREE_RECORD_PATH_MISMATCH",
        category: "SAFETY",
        message: "Worktree record path is not the exact owned trial path.",
        path: "record.path",
      });
    }
  }

  private async isDirty(path: string): Promise<boolean> {
    return (
      (
        await git(path, ["status", "--porcelain=v2", "--untracked-files=all"])
      ).trim().length > 0
    );
  }
}
