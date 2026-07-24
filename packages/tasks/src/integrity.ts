import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  SCHEMA_VERSION,
  canonicalHash,
  sha256,
  type ContentHash,
  type GraderIntegrityFindingV1,
  type GraderIntegrityResultV1,
  type HoldoutAccessV1,
  type TaskSplitManifestV1,
} from "@patchrace/contracts";
import {
  isStrictDescendant,
  resolveOwnedPath,
  runProcess,
  type WorktreeManager,
  type WorktreeRecord,
} from "@patchrace/core";

import { assertSplitAccess } from "./split.js";
import type { LoadedTask } from "./task.js";

export interface CheckGraderIntegrityOptions {
  readonly task: LoadedTask;
  readonly expectedTaskHash: ContentHash;
  readonly expectedConfigHash: ContentHash;
  readonly actualConfigHash: ContentHash;
  readonly manager: WorktreeManager;
  readonly agentWorktree: WorktreeRecord;
  readonly isolation: "enforced-filesystem" | "host-only";
  readonly protectedPaths?: readonly string[];
  readonly agentVisibleRoots?: readonly string[];
  readonly agentInputs?: readonly {
    readonly surface: string;
    readonly content: string;
  }[];
  readonly splitAccess?: {
    readonly manifest: TaskSplitManifestV1;
    readonly phase:
      "candidate-generation" | "candidate-selection" | "final-holdout";
    readonly taskIds: readonly string[];
    readonly holdoutAccess?: HoldoutAccessV1;
  };
  readonly maxScannedFileBytes?: number;
}

function descendantOrEqual(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${sep}`) &&
      !isAbsolute(difference))
  );
}

function zeroSeparated(bytes: Buffer): string[] {
  return bytes
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry.length > 0)
    .sort();
}

async function git(root: string, args: readonly string[]): Promise<Buffer> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args,
    cwd: root,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL"],
    timeoutMs: 30_000,
    maxOutputBytes: 16 * 1024 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  if (result.status !== "completed") {
    throw new Error(
      Buffer.concat(stderr).toString("utf8").trim().slice(0, 500),
    );
  }
  return Buffer.concat(stdout);
}

function globExpression(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function finalize(
  options: CheckGraderIntegrityOptions,
  checkedPaths: readonly string[],
  findings: readonly GraderIntegrityFindingV1[],
): GraderIntegrityResultV1 {
  const status = findings.some((finding) => finding.severity === "failure")
    ? "compromised"
    : findings.length > 0
      ? "unknown"
      : "valid";
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    status,
    taskHash: options.task.taskHash,
    configHash: options.actualConfigHash,
    baselineCommit: options.agentWorktree.baselineCommit,
    isolation: options.isolation,
    checkedPaths: [...new Set(checkedPaths)].sort(),
    findings,
  } as const;
  return { ...payload, resultHash: canonicalHash(payload) };
}

export async function checkGraderIntegrity(
  options: CheckGraderIntegrityOptions,
): Promise<GraderIntegrityResultV1> {
  const findings: GraderIntegrityFindingV1[] = [];
  const checkedPaths: string[] = [];
  const add = (
    code: string,
    severity: GraderIntegrityFindingV1["severity"],
    message: string,
    evidence: GraderIntegrityFindingV1["evidence"],
  ): void => {
    findings.push({ code, severity, message, evidence });
  };

  if (options.expectedConfigHash !== options.actualConfigHash) {
    add(
      "config-hash-mismatch",
      "failure",
      "The grading configuration differs from its immutable commitment.",
      {
        expectedHash: options.expectedConfigHash,
        actualHash: options.actualConfigHash,
      },
    );
  }
  if (options.expectedTaskHash !== options.task.taskHash) {
    add(
      "task-hash-mismatch",
      "failure",
      "The loaded task differs from its immutable commitment.",
      {
        expectedHash: options.expectedTaskHash,
        actualHash: options.task.taskHash,
      },
    );
  }

  let agentRoot: string;
  try {
    agentRoot = await realpath(options.agentWorktree.path);
    const actual = (await options.manager.list()).find(
      (record) => resolve(record.path) === resolve(agentRoot),
    );
    const expectedRecordPath = resolve(
      options.manager.worktreeRoot,
      options.agentWorktree.runId,
      options.agentWorktree.trialId,
    );
    if (
      options.agentWorktree.repositoryRoot !== options.manager.repositoryRoot ||
      options.agentWorktree.worktreeRoot !== options.manager.worktreeRoot ||
      !isStrictDescendant(options.manager.worktreeRoot, agentRoot) ||
      resolve(agentRoot) !== expectedRecordPath ||
      actual?.head?.toLowerCase() !==
        options.agentWorktree.baselineCommit.toLowerCase() ||
      options.agentWorktree.baselineCommit !== options.task.task.baseline.commit
    ) {
      add(
        "agent-worktree-ownership-invalid",
        "failure",
        "The Agent worktree no longer matches its recorded owner and baseline.",
        { path: "agentWorktree", baseline: options.task.task.baseline.commit },
      );
    }
  } catch {
    add(
      "agent-worktree-inspection-error",
      "error",
      "The Agent worktree could not be inspected.",
      { path: "agentWorktree" },
    );
    return finalize(options, checkedPaths, findings);
  }

  const hiddenReferences =
    options.task.task.verifier.visibility === "hidden"
      ? options.task.referencedFiles.filter(
          (reference) => reference.role === "verifier",
        )
      : [];
  const hiddenContent: {
    readonly logicalPath: string;
    readonly bytes: Buffer;
    readonly hash: ContentHash;
  }[] = [];
  const refreshedReferences: {
    readonly role: string;
    readonly logicalPath: string;
    readonly contentHash: ContentHash;
  }[] = [];
  for (const reference of options.task.referencedFiles) {
    try {
      const source = await realpath(reference.sourcePath);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("unsafe");
      const bytes = await readFile(source);
      const actualHash = sha256(bytes);
      refreshedReferences.push({
        role: reference.role,
        logicalPath: reference.logicalPath,
        contentHash: actualHash,
      });
      if (actualHash !== reference.contentHash) {
        add(
          "referenced-asset-hash-mismatch",
          "failure",
          "A referenced task asset changed after loading.",
          {
            role: reference.role,
            logicalPath: reference.logicalPath,
            expectedHash: reference.contentHash,
            actualHash,
          },
        );
      }
      if (
        reference.role === "verifier" &&
        options.task.task.verifier.visibility === "hidden"
      ) {
        hiddenContent.push({
          logicalPath: reference.logicalPath,
          bytes,
          hash: actualHash,
        });
      }
    } catch {
      add(
        "referenced-asset-inspection-error",
        "error",
        "A referenced task asset could not be safely revalidated.",
        { role: reference.role, logicalPath: reference.logicalPath },
      );
    }
  }
  if (refreshedReferences.length === options.task.referencedFiles.length) {
    const refreshedTaskHash = canonicalHash({
      task: options.task.task,
      referencedContent: refreshedReferences,
    });
    if (refreshedTaskHash !== options.task.taskHash) {
      add(
        "task-input-drift",
        "failure",
        "Task data or referenced inputs no longer match the loaded task hash.",
        {
          expectedHash: options.task.taskHash,
          actualHash: refreshedTaskHash,
        },
      );
    }
  }

  const visibleRoots = [
    options.manager.repositoryRoot,
    agentRoot,
    ...(options.agentVisibleRoots ?? []),
  ];
  const canonicalVisible: string[] = [];
  for (const [index, root] of visibleRoots.entries()) {
    try {
      canonicalVisible.push(await realpath(root));
    } catch {
      add(
        "agent-visible-root-inspection-error",
        "error",
        "A declared Agent-visible root could not be inspected.",
        { rootIndex: index },
      );
    }
  }
  for (const reference of hiddenReferences) {
    try {
      const source = await realpath(reference.sourcePath);
      const rootIndex = canonicalVisible.findIndex((root) =>
        descendantOrEqual(root, source),
      );
      if (rootIndex >= 0) {
        add(
          "hidden-source-agent-visible",
          "failure",
          "A hidden verifier source is inside a declared Agent-visible root.",
          { logicalPath: reference.logicalPath, visibleRootIndex: rootIndex },
        );
      }
    } catch {
      // Revalidation already emitted an evidence-safe finding.
    }
  }

  if (options.splitAccess !== undefined) {
    try {
      assertSplitAccess(options.splitAccess);
    } catch {
      add(
        "split-access-violation",
        "failure",
        "The grading request violates its authorized dataset split.",
        {
          phase: options.splitAccess.phase,
          requestedTaskIds: options.splitAccess.taskIds,
        },
      );
    }
  }

  const protectedPatterns = [
    ".patchrace/**",
    ...(options.protectedPaths ?? []),
    ...options.task.task.assertions.flatMap((assertion) =>
      assertion.kind === "protected-paths" ? assertion.paths : [],
    ),
    ...options.task.task.verifier.assets.flatMap((asset) => [
      asset.mount,
      `${asset.mount}/**`,
    ]),
  ];
  let changedPaths: string[] = [];
  let ignoredPaths: string[] = [];
  try {
    const [tracked, untracked, ignored] = await Promise.all([
      git(agentRoot, ["diff", "--name-only", "-z", "HEAD", "--"]),
      git(agentRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
      git(agentRoot, [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "-z",
      ]),
    ]);
    changedPaths = [
      ...new Set([...zeroSeparated(tracked), ...zeroSeparated(untracked)]),
    ].sort();
    ignoredPaths = zeroSeparated(ignored);
    checkedPaths.push(...changedPaths, ...ignoredPaths);
  } catch {
    add(
      "changed-path-inspection-error",
      "error",
      "Git could not enumerate all Agent-modified paths.",
      { path: "agentWorktree" },
    );
  }
  for (const path of [...new Set([...changedPaths, ...ignoredPaths])].sort()) {
    const pattern = protectedPatterns.find((candidate) =>
      globExpression(candidate).test(path),
    );
    if (pattern !== undefined) {
      const hiddenMount = options.task.task.verifier.assets.some(
        (asset) => path === asset.mount || path.startsWith(`${asset.mount}/`),
      );
      add(
        hiddenMount ? "hidden-mount-collision" : "protected-path-modified",
        "failure",
        hiddenMount
          ? "The Agent patch occupies a hidden verifier mount path."
          : "The Agent patch modifies a protected grading path.",
        { path, pattern, ignored: ignoredPaths.includes(path) },
      );
    }
  }

  const mountsBySource = new Map(
    options.task.task.verifier.assets.map((asset) => [
      asset.source,
      asset.mount,
    ]),
  );
  for (const [inputIndex, input] of (options.agentInputs ?? []).entries()) {
    for (const hidden of hiddenContent) {
      const hiddenText = hidden.bytes.toString("utf8");
      const matches = [
        input.content.includes(hidden.logicalPath) ? "source-path" : undefined,
        input.content.includes(mountsBySource.get(hidden.logicalPath) ?? "\0")
          ? "mount-path"
          : undefined,
        input.content.includes(hidden.hash) ? "content-hash" : undefined,
        hidden.bytes.byteLength >= 8 && input.content.includes(hiddenText)
          ? "content"
          : undefined,
      ].filter((value): value is string => value !== undefined);
      for (const matchKind of matches) {
        add(
          "hidden-data-in-agent-input",
          "failure",
          "An Agent-visible input discloses hidden verifier data.",
          {
            inputIndex,
            surface: input.surface,
            verifierAsset: hidden.logicalPath,
            matchKind,
          },
        );
      }
    }
  }

  const maxBytes = options.maxScannedFileBytes ?? 8 * 1024 * 1024;
  for (const path of [...new Set([...changedPaths, ...ignoredPaths])].sort()) {
    let absolute: string;
    try {
      absolute = resolveOwnedPath(agentRoot, path);
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
        add(
          "changed-path-unsafe",
          "failure",
          "An Agent-modified path cannot be safely inspected.",
          { path },
        );
        continue;
      }
      if (!info.isFile()) continue;
      if (info.size > maxBytes) {
        add(
          "changed-file-scan-limit",
          "error",
          "An Agent-modified file exceeds the configured leakage scan limit.",
          { path, bytes: info.size, limitBytes: maxBytes },
        );
        continue;
      }
      const bytes = await readFile(absolute);
      for (const hidden of hiddenContent) {
        if (
          sha256(bytes) === hidden.hash ||
          (hidden.bytes.byteLength > 0 && bytes.includes(hidden.bytes))
        ) {
          add(
            "hidden-content-in-agent-patch",
            "failure",
            "An Agent-modified file contains hidden verifier content.",
            { path, verifierAsset: hidden.logicalPath },
          );
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      add(
        "changed-file-inspection-error",
        "error",
        "An Agent-modified file could not be safely scanned.",
        { path },
      );
    }
  }

  if (
    options.task.task.verifier.visibility === "hidden" &&
    options.isolation === "host-only"
  ) {
    add(
      "host-filesystem-not-enforced",
      "limitation",
      "A host worktree cannot prove that hidden verifier sources were inaccessible to the Agent process.",
      { requiredIsolation: "enforced-filesystem" },
    );
  }
  return finalize(options, checkedPaths, findings);
}
