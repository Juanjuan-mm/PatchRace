import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  sha256,
  type HiddenVerifierResultV1,
  type RunId,
  type TrialId,
} from "@patchrace/contracts";
import {
  ensureOwnedDirectory,
  resolveOwnedPath,
  runProcess,
  type WorktreeManager,
  type WorktreeRecord,
} from "@patchrace/core";

import { runTaskCommandPhase } from "./grader.js";
import type { LoadedTask } from "./task.js";

export interface RunHiddenVerifierOptions {
  readonly task: LoadedTask;
  readonly manager: WorktreeManager;
  readonly agentWorktree: WorktreeRecord;
  readonly graderRunId: RunId;
  readonly graderTrialId: TrialId;
  readonly evidenceDirectory: string;
  readonly agentProcessStopped: boolean;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

interface AgentPatchSnapshot {
  readonly diff: Buffer;
  readonly untracked: readonly {
    readonly path: string;
    readonly bytes: Buffer;
    readonly hash: `sha256:${string}`;
  }[];
  readonly hash: `sha256:${string}`;
}

function hiddenError(
  code: string,
  category: "PREFLIGHT" | "GRADER" | "SAFETY" | "CONFLICT",
  message: string,
  path: string,
  cause?: unknown,
): PatchRaceError {
  return new PatchRaceError(
    { code, category, message, path, retryable: false },
    cause === undefined ? undefined : { cause },
  );
}

function isDescendant(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function git(
  cwd: string,
  args: readonly string[],
  stdin?: Buffer,
): Promise<Buffer> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args,
    cwd,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL"],
    timeoutMs: 30_000,
    maxOutputBytes: 32 * 1024 * 1024,
    ...(stdin === undefined ? {} : { stdin }),
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  if (result.status !== "completed") {
    throw hiddenError(
      "HIDDEN_VERIFIER_GIT_FAILED",
      "GRADER",
      `Git operation '${args[0] ?? "unknown"}' failed.`,
      "agentPatch",
      new Error(Buffer.concat(stderr).toString("utf8")),
    );
  }
  return Buffer.concat(stdout);
}

function zeroSeparated(bytes: Buffer): string[] {
  return bytes
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry.length > 0)
    .sort();
}

async function snapshotAgentPatch(path: string): Promise<AgentPatchSnapshot> {
  const conflicts = zeroSeparated(
    await git(path, ["diff", "--name-only", "--diff-filter=U", "-z", "--"]),
  );
  if (conflicts.length > 0) {
    throw hiddenError(
      "HIDDEN_VERIFIER_PATCH_CONFLICTED",
      "GRADER",
      "Agent patch contains unresolved merge conflicts.",
      "agentPatch",
    );
  }
  const [diff, names] = await Promise.all([
    git(path, ["diff", "--binary", "--full-index", "HEAD", "--"]),
    git(path, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const untracked: AgentPatchSnapshot["untracked"][number][] = [];
  for (const logicalPath of zeroSeparated(names)) {
    const source = resolveOwnedPath(path, logicalPath);
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw hiddenError(
        "HIDDEN_VERIFIER_UNTRACKED_UNSAFE",
        "SAFETY",
        `Untracked patch path '${logicalPath}' is not a regular file.`,
        logicalPath,
      );
    }
    const bytes = await readFile(source);
    untracked.push({ path: logicalPath, bytes, hash: sha256(bytes) });
  }
  return {
    diff,
    untracked,
    hash: canonicalHash({
      diffHash: sha256(diff),
      untracked: untracked.map(({ path: logicalPath, hash }) => ({
        path: logicalPath,
        hash,
      })),
    }),
  };
}

async function copySnapshot(
  snapshot: AgentPatchSnapshot,
  graderRoot: string,
): Promise<void> {
  if (snapshot.diff.byteLength > 0) {
    await git(
      graderRoot,
      ["apply", "--binary", "--whitespace=nowarn", "-"],
      snapshot.diff,
    );
  }
  for (const file of snapshot.untracked) {
    const parent = dirname(file.path);
    if (parent !== ".") await ensureOwnedDirectory(graderRoot, parent);
    await writeFile(resolveOwnedPath(graderRoot, file.path), file.bytes, {
      flag: "wx",
    });
  }
}

async function injectAssets(
  loaded: LoadedTask,
  repositoryRoot: string,
  agentRoot: string,
  graderRoot: string,
): Promise<HiddenVerifierResultV1["injectedAssets"]> {
  const references = new Map(
    loaded.referencedFiles
      .filter((file) => file.role === "verifier")
      .map((file) => [file.logicalPath, file]),
  );
  const injected: { mount: string; hash: `sha256:${string}` }[] = [];
  for (const asset of loaded.task.verifier.assets) {
    const reference = references.get(asset.source);
    if (reference === undefined) {
      throw hiddenError(
        "HIDDEN_VERIFIER_REFERENCE_MISSING",
        "GRADER",
        "Loaded verifier reference is unavailable.",
        asset.source,
      );
    }
    const source = await realpath(reference.sourcePath);
    if (
      source === repositoryRoot ||
      isDescendant(repositoryRoot, source) ||
      source === agentRoot ||
      isDescendant(agentRoot, source) ||
      source === graderRoot ||
      isDescendant(graderRoot, source)
    ) {
      throw hiddenError(
        "HIDDEN_VERIFIER_SOURCE_VISIBLE",
        "SAFETY",
        "Hidden verifier source is inside a repository or worktree boundary.",
        asset.source,
      );
    }
    const bytes = await readFile(source);
    if (sha256(bytes) !== asset.hash) {
      throw hiddenError(
        "HIDDEN_VERIFIER_HASH_MISMATCH",
        "GRADER",
        "Hidden verifier content changed after task loading.",
        asset.source,
      );
    }
    const agentTarget = resolveOwnedPath(agentRoot, asset.mount);
    if (await exists(agentTarget)) {
      throw hiddenError(
        "HIDDEN_VERIFIER_AGENT_COLLISION",
        "CONFLICT",
        "Agent patch already contains a hidden verifier mount path.",
        asset.mount,
      );
    }
    const parent = dirname(asset.mount);
    if (parent !== ".") await ensureOwnedDirectory(graderRoot, parent);
    const target = resolveOwnedPath(graderRoot, asset.mount);
    try {
      await writeFile(target, bytes, { flag: "wx" });
    } catch (error) {
      throw hiddenError(
        "HIDDEN_VERIFIER_MOUNT_COLLISION",
        "CONFLICT",
        "Hidden verifier mount path already exists or is unsafe.",
        asset.mount,
        error,
      );
    }
    injected.push({ mount: asset.mount, hash: asset.hash });
  }
  return injected;
}

export async function runHiddenVerifier(
  options: RunHiddenVerifierOptions,
): Promise<HiddenVerifierResultV1> {
  if (options.agentProcessStopped !== true) {
    throw hiddenError(
      "HIDDEN_VERIFIER_AGENT_STILL_RUNNING",
      "PREFLIGHT",
      "Hidden verification requires a confirmed stopped Agent process group.",
      "agentProcessStopped",
    );
  }
  if (options.task.task.verifier.visibility !== "hidden") {
    throw hiddenError(
      "HIDDEN_VERIFIER_TASK_NOT_HIDDEN",
      "PREFLIGHT",
      "Task verifier visibility is not hidden.",
      "task.verifier.visibility",
    );
  }
  const agentRoot = await realpath(options.agentWorktree.path);
  const actualAgent = (await options.manager.list()).find(
    (record) => resolve(record.path) === resolve(agentRoot),
  );
  if (
    options.agentWorktree.repositoryRoot !== options.manager.repositoryRoot ||
    options.agentWorktree.worktreeRoot !== options.manager.worktreeRoot ||
    options.agentWorktree.baselineCommit !==
      options.task.task.baseline.commit ||
    actualAgent?.head?.toLowerCase() !==
      options.agentWorktree.baselineCommit.toLowerCase()
  ) {
    throw hiddenError(
      "HIDDEN_VERIFIER_AGENT_OWNERSHIP_INVALID",
      "SAFETY",
      "Agent worktree does not match the task and manager records.",
      "agentWorktree",
    );
  }
  const snapshot = await snapshotAgentPatch(agentRoot);
  const grader = await options.manager.create({
    runId: options.graderRunId,
    trialId: options.graderTrialId,
    commit: options.task.task.baseline.commit,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  await copySnapshot(snapshot, grader.path);
  const setup = await runTaskCommandPhase({
    task: options.task.task,
    phase: "setup",
    workingDirectory: grader.path,
    evidenceDirectory: options.evidenceDirectory,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const injectedAssets = await injectAssets(
    options.task,
    options.manager.repositoryRoot,
    agentRoot,
    grader.path,
  );
  const verifier = await runTaskCommandPhase({
    task: options.task.task,
    phase: "verifier",
    workingDirectory: grader.path,
    evidenceDirectory: options.evidenceDirectory,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const cleanup = await options.manager.cleanup(grader, {
    confirm: true,
    allowDirty: true,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    taskHash: options.task.taskHash,
    agentPatchHash: snapshot.hash,
    setup,
    injectedAssets,
    verifier,
    graderWorktreeCleaned: cleanup.removed,
  };
}
