import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  sha256,
  type AssertionPhaseResultV1,
  type DeterministicAssertionResultV1,
  type DeterministicCommandEvidenceV1,
  type JsonValue,
  type TaskAssertionV1,
  type TaskV1,
} from "@patchrace/contracts";
import { runProcess } from "@patchrace/core";

export interface EvaluateTaskAssertionsOptions {
  readonly task: TaskV1;
  readonly workingDirectory: string;
  readonly baselineCommit?: string;
  readonly commandEvidence?: readonly DeterministicCommandEvidenceV1[];
}

type RepositorySummary = AssertionPhaseResultV1["summary"] & {
  readonly paths: readonly string[];
  readonly changedPaths: readonly string[];
};

function assertionError(
  code: string,
  category: "PREFLIGHT" | "GRADER" | "SAFETY",
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
  const path = relative(root, candidate);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

function parseZeroSeparated(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry.length > 0);
}

async function gitOutput(
  root: string,
  args: readonly string[],
): Promise<Buffer> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args,
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 10 * 1024 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  if (result.status !== "completed") {
    throw assertionError(
      "GRADER_GIT_INSPECTION_FAILED",
      "GRADER",
      `Git inspection failed for '${args[0] ?? "unknown"}'.`,
      "workingDirectory",
      new Error(Buffer.concat(stderr).toString("utf8")),
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

function matches(pattern: string, path: string): boolean {
  return globExpression(pattern).test(path);
}

async function repositoryPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (prefix === "" && entry.name === ".git") continue;
      const logical = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      paths.push(logical);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await visit(resolve(directory, entry.name), logical);
      }
    }
  }
  await visit(root, "");
  return paths;
}

function lineCount(bytes: Buffer): number {
  if (bytes.byteLength === 0) return 0;
  let lines = 0;
  for (const byte of bytes) if (byte === 10) lines += 1;
  return lines + (bytes.at(-1) === 10 ? 0 : 1);
}

const dependencyFiles = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
]);
const lockfiles = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Pipfile.lock",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "gradle.lockfile",
]);

async function summarizeRepository(
  root: string,
  baselineCommit: string,
): Promise<RepositorySummary> {
  const [numstatOutput, untrackedOutput, conflictsOutput, paths] =
    await Promise.all([
      gitOutput(root, [
        "diff",
        "--numstat",
        "--no-renames",
        "-z",
        baselineCommit,
        "--",
      ]),
      gitOutput(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      gitOutput(root, ["diff", "--name-only", "--diff-filter=U", "-z", "--"]),
      repositoryPaths(root),
    ]);
  const changed = new Set<string>();
  let changedLines = 0;
  let binaryFiles = 0;
  for (const entry of parseZeroSeparated(numstatOutput)) {
    const first = entry.indexOf("\t");
    const second = entry.indexOf("\t", first + 1);
    if (first < 0 || second < 0) {
      throw assertionError(
        "GRADER_GIT_NUMSTAT_MALFORMED",
        "GRADER",
        "Git returned malformed numstat evidence.",
        "git.diff",
      );
    }
    const additions = entry.slice(0, first);
    const deletions = entry.slice(first + 1, second);
    const path = entry.slice(second + 1);
    changed.add(path);
    if (additions === "-" || deletions === "-") binaryFiles += 1;
    else changedLines += Number(additions) + Number(deletions);
  }
  const untrackedPaths = parseZeroSeparated(untrackedOutput).sort();
  for (const path of untrackedPaths) {
    changed.add(path);
    const absolute = resolve(root, path);
    const info = await lstat(absolute);
    if (!info.isFile()) {
      binaryFiles += 1;
      continue;
    }
    const bytes = await readFile(absolute);
    if (bytes.includes(0)) binaryFiles += 1;
    else changedLines += lineCount(bytes);
  }
  const changedPaths = [...changed].sort();
  const dependencyChanges = changedPaths.filter(
    (path) =>
      dependencyFiles.has(basename(path)) ||
      /^requirements(?:-[^.]+)?\.txt$/.test(basename(path)),
  );
  const lockfileChanges = changedPaths.filter((path) =>
    lockfiles.has(basename(path)),
  );
  return {
    paths,
    changedPaths,
    changedFiles: changedPaths.length,
    changedLines,
    binaryFiles,
    dependencyChanges,
    lockfileChanges,
    untrackedPaths,
    conflictedPaths: parseZeroSeparated(conflictsOutput).sort(),
  };
}

function result(
  assertion: TaskAssertionV1,
  status: DeterministicAssertionResultV1["status"],
  message: string,
  evidence: Readonly<Record<string, JsonValue>>,
): DeterministicAssertionResultV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: assertion.id,
    kind: assertion.kind,
    status,
    message,
    evidence,
  };
}

async function safeFile(root: string, logicalPath: string): Promise<Buffer> {
  const candidate = resolve(root, logicalPath);
  if (!isDescendant(root, candidate)) {
    throw assertionError(
      "GRADER_ASSERTION_PATH_UNSAFE",
      "SAFETY",
      "File-content assertion path escapes the worktree.",
      logicalPath,
    );
  }
  const canonical = await realpath(candidate).catch((error: unknown) => {
    throw assertionError(
      "GRADER_ASSERTION_FILE_MISSING",
      "GRADER",
      `Asserted file '${logicalPath}' does not exist.`,
      logicalPath,
      error,
    );
  });
  if (!isDescendant(root, canonical)) {
    throw assertionError(
      "GRADER_ASSERTION_PATH_UNSAFE",
      "SAFETY",
      "File-content assertion resolves outside the worktree.",
      logicalPath,
    );
  }
  return readFile(canonical);
}

async function evaluateOne(
  assertion: TaskAssertionV1,
  summary: RepositorySummary,
  root: string,
  commandEvidence: readonly DeterministicCommandEvidenceV1[],
): Promise<DeterministicAssertionResultV1> {
  if (
    assertion.kind === "required-paths" ||
    assertion.kind === "forbidden-paths" ||
    assertion.kind === "protected-paths"
  ) {
    const candidates =
      assertion.kind === "protected-paths"
        ? summary.changedPaths
        : summary.paths;
    const matched = assertion.paths.filter((pattern) =>
      candidates.some((path) => matches(pattern, path)),
    );
    const passed =
      assertion.kind === "required-paths"
        ? matched.length === assertion.paths.length
        : matched.length === 0;
    return result(
      assertion,
      passed ? "passed" : "failed",
      passed ? "Path assertion passed." : "Path assertion failed.",
      { patterns: assertion.paths, matched },
    );
  }
  if (assertion.kind === "file-content") {
    try {
      const bytes = await safeFile(root, assertion.path);
      const text = bytes.toString("utf8");
      const passed =
        assertion.exact !== undefined
          ? text === assertion.exact
          : assertion.regex !== undefined
            ? new RegExp(assertion.regex, "u").test(text)
            : sha256(bytes) === assertion.hash;
      return result(
        assertion,
        passed ? "passed" : "failed",
        passed ? "File content matched." : "File content did not match.",
        { path: assertion.path, actualHash: sha256(bytes) },
      );
    } catch (error) {
      if (error instanceof PatchRaceError) {
        return result(
          assertion,
          error.details.category === "SAFETY" ? "error" : "failed",
          error.message,
          {
            path: assertion.path,
            code: error.details.code,
          },
        );
      }
      return result(
        assertion,
        "error",
        "File-content rule could not be evaluated.",
        {
          path: assertion.path,
        },
      );
    }
  }
  if (assertion.kind === "diff-limit") {
    const violations: string[] = [];
    if (
      assertion.maxChangedFiles !== undefined &&
      summary.changedFiles > assertion.maxChangedFiles
    )
      violations.push("maxChangedFiles");
    if (
      assertion.maxLines !== undefined &&
      summary.changedLines > assertion.maxLines
    )
      violations.push("maxLines");
    if (
      assertion.maxBinaryFiles !== undefined &&
      summary.binaryFiles > assertion.maxBinaryFiles
    )
      violations.push("maxBinaryFiles");
    if (
      assertion.allowDependencyChanges === false &&
      summary.dependencyChanges.length > 0
    )
      violations.push("dependencyChanges");
    if (
      assertion.allowLockfileChanges === false &&
      summary.lockfileChanges.length > 0
    )
      violations.push("lockfileChanges");
    return result(
      assertion,
      violations.length === 0 ? "passed" : "failed",
      violations.length === 0
        ? "Diff limits passed."
        : "Diff limits were exceeded.",
      {
        changedFiles: summary.changedFiles,
        changedLines: summary.changedLines,
        binaryFiles: summary.binaryFiles,
        dependencyChanges: summary.dependencyChanges,
        lockfileChanges: summary.lockfileChanges,
        violations,
      },
    );
  }
  if (assertion.kind === "repository-cleanliness") {
    const disallowed = summary.untrackedPaths.filter(
      (path) =>
        !(assertion.allowedUntrackedPaths ?? []).some((pattern) =>
          matches(pattern, path),
        ),
    );
    const passed =
      disallowed.length === 0 && summary.conflictedPaths.length === 0;
    return result(
      assertion,
      passed ? "passed" : "failed",
      passed
        ? "Repository cleanliness passed."
        : "Repository contains disallowed untracked or conflicted paths.",
      {
        disallowedUntrackedPaths: disallowed,
        conflictedPaths: summary.conflictedPaths,
      },
    );
  }
  if (assertion.kind === "command") {
    const command = commandEvidence.find(
      (candidate) => candidate.id === assertion.commandId,
    );
    if (command === undefined)
      return result(
        assertion,
        "error",
        "Referenced command evidence is unavailable.",
        {
          commandId: assertion.commandId,
        },
      );
    const expected = assertion.expectedStatus ?? "passed";
    const passed = command.status === expected;
    return result(
      assertion,
      passed ? "passed" : "failed",
      passed ? "Command assertion passed." : "Command assertion failed.",
      { commandId: assertion.commandId, expected, actual: command.status },
    );
  }
  if (assertion.optionalReason !== undefined) {
    return result(assertion, "skipped", assertion.optionalReason, {});
  }
  return result(
    assertion,
    "error",
    "Assertion kind is not available in this grader phase.",
    {},
  );
}

export async function evaluateTaskAssertions(
  options: EvaluateTaskAssertionsOptions,
): Promise<AssertionPhaseResultV1> {
  const root = await realpath(resolve(options.workingDirectory)).catch(
    (error: unknown) => {
      throw assertionError(
        "GRADER_WORKTREE_INVALID",
        "PREFLIGHT",
        "Assertion worktree does not exist.",
        "workingDirectory",
        error,
      );
    },
  );
  const baselineCommit = options.baselineCommit ?? options.task.baseline.commit;
  if (baselineCommit !== options.task.baseline.commit) {
    throw assertionError(
      "GRADER_BASELINE_MISMATCH",
      "GRADER",
      "Assertion baseline does not match the immutable task baseline.",
      "baselineCommit",
    );
  }
  const summary = await summarizeRepository(root, baselineCommit);
  const assertions: DeterministicAssertionResultV1[] = [];
  for (const assertion of options.task.assertions) {
    assertions.push(
      await evaluateOne(
        assertion,
        summary,
        root,
        options.commandEvidence ?? [],
      ),
    );
  }
  const status = assertions.some((assertion) => assertion.status === "error")
    ? "error"
    : assertions.some((assertion) => assertion.status === "failed")
      ? "failed"
      : "passed";
  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    assertions,
    summary: {
      changedFiles: summary.changedFiles,
      changedLines: summary.changedLines,
      binaryFiles: summary.binaryFiles,
      dependencyChanges: summary.dependencyChanges,
      lockfileChanges: summary.lockfileChanges,
      untrackedPaths: summary.untrackedPaths,
      conflictedPaths: summary.conflictedPaths,
    },
  };
}
