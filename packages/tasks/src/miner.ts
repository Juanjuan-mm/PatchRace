import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  sha256,
  type MinedFileCategory,
  type MinedTaskCandidateV1,
} from "@patchrace/contracts";
import { runProcess } from "@patchrace/core";

export const TASK_MINER_VERSION = "1.0.0" as const;

export interface MineGitHistoryOptions {
  readonly repositoryRoot: string;
  readonly commit?: string;
  readonly since?: string;
  readonly max?: number;
  readonly maxChangedFiles?: number;
  readonly maxPatchBytes?: number;
}

export interface MinedTaskCandidate extends MinedTaskCandidateV1 {
  readonly referencePatch: Uint8Array;
  readonly implementationPatch: Uint8Array | null;
  readonly testPatch: Uint8Array | null;
}

export function serializeMinedCandidate(candidate: MinedTaskCandidate): string {
  return `${canonicalJson({
    ...candidate,
    referencePatch: undefined,
    implementationPatch: undefined,
    testPatch: undefined,
  })}\n`;
}

function minerError(
  code: string,
  category: "CONFIG" | "PREFLIGHT" | "GRADER" | "SAFETY",
  message: string,
  path: string,
  cause?: unknown,
): PatchRaceError {
  return new PatchRaceError(
    { code, category, message, path, retryable: false },
    cause === undefined ? undefined : { cause },
  );
}

async function git(
  root: string,
  args: readonly string[],
  options: {
    readonly stdin?: Uint8Array;
    readonly allowFailure?: boolean;
  } = {},
): Promise<{ readonly output: Buffer; readonly ok: boolean }> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args: ["-C", root, ...args],
    cwd: root,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL"],
    timeoutMs: 30_000,
    maxOutputBytes: 8 * 1024 * 1024,
    ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  if (result.status !== "completed" && options.allowFailure !== true) {
    throw minerError(
      "TASK_MINER_GIT_FAILED",
      "GRADER",
      `Git history inspection failed for '${args[0] ?? "unknown"}'.`,
      "repositoryRoot",
      new Error(Buffer.concat(stderr).toString("utf8")),
    );
  }
  return { output: Buffer.concat(stdout), ok: result.status === "completed" };
}

function zeroSeparated(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((part) => part.length > 0);
}

function category(path: string): MinedFileCategory {
  const lower = path.toLowerCase();
  if (
    /(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(lower) ||
    /\.(test|spec)\.[^/]+$/.test(lower)
  )
    return "test";
  if (
    /(^|\/)(docs?|documentation)(\/|$)/.test(lower) ||
    /(^|\/)(readme|changelog|contributing)(\.|$)/.test(lower) ||
    /\.mdx?$/.test(lower)
  )
    return "documentation";
  if (
    /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod)$/.test(lower) ||
    /(^|\/)(tsconfig[^/]*\.json|eslint[^/]*|\.github\/workflows\/)/.test(lower)
  )
    return "configuration";
  if (
    /\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|rb|php|swift|cs|cpp|cc|c|h)$/.test(
      lower,
    )
  )
    return "implementation";
  return "other";
}

function unsafePath(path: string): boolean {
  return (
    path.length === 0 ||
    path.includes("\0") ||
    isAbsolute(path) ||
    path.split(/[\\/]/).some((part) => part === ".." || part === "")
  );
}

function sensitivePath(path: string): boolean {
  const name = basename(path).toLowerCase();
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    /(?:secret|credential|token|private[-_.]?key)/.test(name) ||
    /\.(?:pem|p12|pfx|key)$/.test(name)
  );
}

function numstatBinaryPaths(output: Buffer): Set<string> {
  const binary = new Set<string>();
  for (const entry of zeroSeparated(output)) {
    const first = entry.indexOf("\t");
    const second = entry.indexOf("\t", first + 1);
    if (first < 0 || second < 0) continue;
    if (entry.slice(0, first) === "-" || entry.slice(first + 1, second) === "-")
      binary.add(entry.slice(second + 1));
  }
  return binary;
}

async function verifyReconstruction(
  repositoryRoot: string,
  parent: string,
  patch: Buffer,
): Promise<boolean> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "patchrace-mine-replay-"));
  const worktree = join(temporaryRoot, "worktree");
  let added = false;
  try {
    const create = await git(
      repositoryRoot,
      ["worktree", "add", "--detach", worktree, parent],
      { allowFailure: true },
    );
    if (!create.ok) return false;
    added = true;
    const head = (await git(worktree, ["rev-parse", "HEAD"])).output
      .toString("utf8")
      .trim();
    if (head !== parent) return false;
    return (
      await git(worktree, ["apply", "--check", "--binary", "-"], {
        stdin: patch,
        allowFailure: true,
      })
    ).ok;
  } finally {
    if (added) {
      await git(repositoryRoot, ["worktree", "remove", "--force", worktree], {
        allowFailure: true,
      });
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function assertLimits(options: MineGitHistoryOptions): void {
  for (const [path, value] of [
    ["max", options.max],
    ["maxChangedFiles", options.maxChangedFiles],
    ["maxPatchBytes", options.maxPatchBytes],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw minerError(
        "TASK_MINER_LIMIT_INVALID",
        "CONFIG",
        `${path} must be a positive safe integer.`,
        path,
      );
    }
  }
}

export async function mineGitHistory(
  options: MineGitHistoryOptions,
): Promise<readonly MinedTaskCandidate[]> {
  assertLimits(options);
  const repositoryRoot = await realpath(options.repositoryRoot).catch(
    (error: unknown) => {
      throw minerError(
        "TASK_MINER_REPOSITORY_MISSING",
        "PREFLIGHT",
        "Repository root does not exist.",
        "repositoryRoot",
        error,
      );
    },
  );
  const reported = (
    await git(repositoryRoot, ["rev-parse", "--show-toplevel"])
  ).output
    .toString("utf8")
    .trim();
  if ((await realpath(reported)) !== repositoryRoot) {
    throw minerError(
      "TASK_MINER_ROOT_MISMATCH",
      "SAFETY",
      "Configured repository root is not the Git top-level.",
      "repositoryRoot",
    );
  }
  const max = options.max ?? 20;
  const discoveryQuery = options.commit
    ? `commit:${options.commit}`
    : options.since
      ? `rev-list:${options.since}..HEAD:max=${max}`
      : `rev-list:HEAD:max=${max}`;
  const commits = options.commit
    ? [options.commit]
    : (
        await git(repositoryRoot, [
          "rev-list",
          `--max-count=${max}`,
          options.since ? `${options.since}..HEAD` : "HEAD",
        ])
      ).output
        .toString("utf8")
        .trim()
        .split(/\s+/u)
        .filter(Boolean);
  const candidates: MinedTaskCandidate[] = [];
  for (const revision of commits) {
    const commit = (
      await git(repositoryRoot, [
        "rev-parse",
        "--verify",
        `${revision}^{commit}`,
      ])
    ).output
      .toString("utf8")
      .trim()
      .toLowerCase();
    const metadata = (
      await git(repositoryRoot, [
        "show",
        "-s",
        "--no-patch",
        "--format=%H%x00%P%x00%ct%x00%an%x00%ae%x00%s%x00%b",
        commit,
      ])
    ).output
      .toString("utf8")
      .replace(/\n$/, "")
      .split("\0");
    const parents = (metadata[1] ?? "").split(" ").filter(Boolean);
    const parent = parents.length === 1 ? parents[0]! : null;
    const reasons: string[] = [];
    if (parents.length === 0) reasons.push("root-commit");
    if (parents.length > 1) reasons.push("merge-commit");
    let files: MinedTaskCandidateV1["files"] = [];
    let referencePatch: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let implementationPatch: Buffer<ArrayBufferLike> | null = null;
    let testPatch: Buffer<ArrayBufferLike> | null = null;
    if (parent !== null) {
      const [statusOutput, numstatOutput, patchOutput] = await Promise.all([
        git(repositoryRoot, [
          "diff",
          "--name-status",
          "--no-renames",
          "-z",
          parent,
          commit,
          "--",
        ]),
        git(repositoryRoot, [
          "diff",
          "--numstat",
          "--no-renames",
          "-z",
          parent,
          commit,
          "--",
        ]),
        git(repositoryRoot, [
          "diff",
          "--binary",
          "--full-index",
          parent,
          commit,
          "--",
        ]),
      ]);
      referencePatch = patchOutput.output;
      const binaryPaths = numstatBinaryPaths(numstatOutput.output);
      const statusParts = zeroSeparated(statusOutput.output);
      const collected: MinedTaskCandidateV1["files"][number][] = [];
      for (let index = 0; index < statusParts.length; index += 2) {
        const status = statusParts[index];
        const path = statusParts[index + 1];
        if (status === undefined || path === undefined) {
          reasons.push("malformed-diff");
          break;
        }
        collected.push({
          path,
          status,
          category: category(path),
          binary: binaryPaths.has(path),
        });
      }
      files = collected;
      if (files.length === 0) reasons.push("empty-change");
      if (files.length > (options.maxChangedFiles ?? 50))
        reasons.push("too-many-files");
      if (referencePatch.byteLength > (options.maxPatchBytes ?? 1024 * 1024))
        reasons.push("patch-too-large");
      if (files.some((file) => file.binary)) reasons.push("binary-change");
      if (files.some((file) => unsafePath(file.path)))
        reasons.push("unsafe-path");
      if (files.some((file) => sensitivePath(file.path)))
        reasons.push("sensitive-path");
      const implementationPaths = files
        .filter((file) => file.category === "implementation")
        .map((file) => file.path);
      const testPaths = files
        .filter((file) => file.category === "test")
        .map((file) => file.path);
      if (implementationPaths.length === 0)
        reasons.push("no-implementation-change");
      if (testPaths.length === 0) reasons.push("no-test-change");
      if (implementationPaths.length > 0) {
        implementationPatch = (
          await git(repositoryRoot, [
            "diff",
            "--binary",
            "--full-index",
            parent,
            commit,
            "--",
            ...implementationPaths,
          ])
        ).output;
      }
      if (testPaths.length > 0) {
        testPatch = (
          await git(repositoryRoot, [
            "diff",
            "--binary",
            "--full-index",
            parent,
            commit,
            "--",
            ...testPaths,
          ])
        ).output;
      }
      if (!(await verifyReconstruction(repositoryRoot, parent, referencePatch)))
        reasons.push("reconstruction-failed");
    }
    const authoredSeconds = Number(metadata[2] ?? "0");
    const authorIdentity = `${metadata[3] ?? ""}\0${metadata[4] ?? ""}`;
    candidates.push({
      schemaVersion: SCHEMA_VERSION,
      id: `mined-${commit.slice(0, 12)}`,
      commit,
      parents,
      parent,
      subject: metadata[5] ?? "",
      bodyHash: sha256(metadata[6] ?? ""),
      authoredAt: new Date(authoredSeconds * 1000).toISOString(),
      authorIdentityHash: sha256(authorIdentity),
      files,
      referencePatchHash: sha256(referencePatch),
      implementationPatchHash:
        implementationPatch === null ? null : sha256(implementationPatch),
      testPatchHash: testPatch === null ? null : sha256(testPatch),
      patchBytes: referencePatch.byteLength,
      eligibility: reasons.length === 0 ? "eligible" : "filtered",
      exclusionReasons: [...new Set(reasons)].sort(),
      review: { required: true, status: "pending" },
      provenance: {
        source: "git-history",
        discoveryQuery,
        extractionToolVersion: TASK_MINER_VERSION,
      },
      referencePatch,
      implementationPatch,
      testPatch,
    });
  }
  return candidates;
}
