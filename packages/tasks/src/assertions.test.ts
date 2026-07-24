import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  sha256,
  type TaskAssertionV1,
  type TaskV1,
} from "@patchrace/contracts";

import { evaluateTaskAssertions } from "./assertions.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function gitProject(): Promise<{
  readonly root: string;
  readonly baseline: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-assertions-"));
  temporaryDirectories.push(root);
  await execute("git", ["init", "-q", "-b", "main"], { cwd: root });
  await execute("git", ["config", "user.name", "PatchRace Fixture"], {
    cwd: root,
  });
  await execute("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: root,
  });
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "base.txt"), "before\n");
  await writeFile(join(root, "package.json"), '{"name":"fixture"}\n');
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "baseline"], { cwd: root });
  const baseline = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  return { root, baseline };
}

function task(
  baseline: string,
  assertions: readonly TaskAssertionV1[],
): TaskV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "assertions",
    revision: 1,
    baseline: {
      repository: ".",
      commit: baseline,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: { file: "instruction.md", hash: sha256("instruction\n") },
    setup: { commands: [], assets: [] },
    verifier: {
      visibility: "public",
      assets: [],
      commands: [
        {
          id: "test",
          kind: "test",
          argv: ["git", "diff", "--check"],
          timeoutSeconds: 30,
        },
      ],
    },
    assertions,
    budgets: {
      trialSeconds: 30,
      maxTokens: null,
      maxCostUsd: null,
      maxPatchLines: 100,
    },
    provenance: {
      source: "manual",
      sourceCommit: baseline,
      referencePatchHash: sha256(""),
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "user",
    },
    metadata: {},
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("evaluateTaskAssertions", () => {
  it("enforces paths, contents, diff limits, dependencies, locks, and cleanliness", async () => {
    const { root, baseline } = await gitProject();
    await writeFile(join(root, "src", "base.txt"), "after\n");
    await writeFile(join(root, "package.json"), '{"name":"changed"}\n');
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.1'\n");
    await writeFile(join(root, "src", "new.txt"), "new\n");
    await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(
      join(root, ".github", "workflows", "unsafe.yml"),
      "name: unsafe\n",
    );
    await mkdir(join(root, "generated"));
    await writeFile(join(root, "generated", "allowed.txt"), "allowed\n");

    const result = await evaluateTaskAssertions({
      task: task(baseline, [
        { id: "required", kind: "required-paths", paths: ["src/new.txt"] },
        { id: "forbidden", kind: "forbidden-paths", paths: ["secret/**"] },
        { id: "protected", kind: "protected-paths", paths: [".github/**"] },
        {
          id: "content",
          kind: "file-content",
          path: "src/base.txt",
          encoding: "utf8",
          regex: "^after\\n$",
        },
        {
          id: "limits",
          kind: "diff-limit",
          maxChangedFiles: 3,
          maxLines: 5,
          maxBinaryFiles: 0,
          allowDependencyChanges: false,
          allowLockfileChanges: false,
        },
        {
          id: "clean",
          kind: "repository-cleanliness",
          allowedUntrackedPaths: ["generated/**"],
        },
      ]),
      workingDirectory: root,
    });

    expect(result.status).toBe("failed");
    expect(result.summary).toEqual({
      changedFiles: 7,
      changedLines: 9,
      binaryFiles: 1,
      dependencyChanges: ["package.json"],
      lockfileChanges: ["pnpm-lock.yaml"],
      untrackedPaths: [
        ".github/workflows/unsafe.yml",
        "binary.bin",
        "generated/allowed.txt",
        "src/new.txt",
      ],
      conflictedPaths: [],
    });
    expect(
      Object.fromEntries(
        result.assertions.map((entry) => [entry.id, entry.status]),
      ),
    ).toEqual({
      required: "passed",
      forbidden: "passed",
      protected: "failed",
      content: "passed",
      limits: "failed",
      clean: "failed",
    });
    expect(await readFile(join(root, "src", "base.txt"), "utf8")).toBe(
      "after\n",
    );
  });

  it("passes bounded allowed changes and rejects baseline mismatch", async () => {
    const { root, baseline } = await gitProject();
    await writeFile(join(root, "src", "new.txt"), "new\n");
    const configured = task(baseline, [
      { id: "required", kind: "required-paths", paths: ["src/*.txt"] },
      { id: "protected", kind: "protected-paths", paths: ["docs/**"] },
      {
        id: "limits",
        kind: "diff-limit",
        maxChangedFiles: 1,
        maxLines: 1,
        maxBinaryFiles: 0,
        allowDependencyChanges: false,
        allowLockfileChanges: false,
      },
      {
        id: "clean",
        kind: "repository-cleanliness",
        allowedUntrackedPaths: ["src/new.txt"],
      },
    ]);
    await expect(
      evaluateTaskAssertions({ task: configured, workingDirectory: root }),
    ).resolves.toMatchObject({ status: "passed" });
    await expect(
      evaluateTaskAssertions({
        task: configured,
        workingDirectory: root,
        baselineCommit: "b".repeat(40),
      }),
    ).rejects.toMatchObject({
      details: { code: "GRADER_BASELINE_MISMATCH" },
    });
  });

  it("treats symlink escapes as grader errors and detects merge conflicts", async () => {
    const { root, baseline } = await gitProject();
    const outside = await mkdtemp(
      join(tmpdir(), "patchrace-assertions-outside-"),
    );
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "secret.txt"), "secret\n");
    await symlink(join(outside, "secret.txt"), join(root, "escaped.txt"));
    const escaped = await evaluateTaskAssertions({
      task: task(baseline, [
        {
          id: "escaped",
          kind: "file-content",
          path: "escaped.txt",
          encoding: "utf8",
          exact: "secret\n",
        },
      ]),
      workingDirectory: root,
    });
    expect(escaped).toMatchObject({
      status: "error",
      assertions: [
        { status: "error", evidence: { code: "GRADER_ASSERTION_PATH_UNSAFE" } },
      ],
    });

    await rm(join(root, "escaped.txt"));
    await execute("git", ["switch", "-qc", "other"], { cwd: root });
    await writeFile(join(root, "src", "base.txt"), "other\n");
    await execute("git", ["commit", "-qam", "other"], { cwd: root });
    await execute("git", ["switch", "-q", "main"], { cwd: root });
    await writeFile(join(root, "src", "base.txt"), "main\n");
    await execute("git", ["commit", "-qam", "main"], { cwd: root });
    await expect(
      execute("git", ["merge", "other"], { cwd: root }),
    ).rejects.toThrow();
    const conflicted = await evaluateTaskAssertions({
      task: task(baseline, [{ id: "clean", kind: "repository-cleanliness" }]),
      workingDirectory: root,
    });
    expect(conflicted).toMatchObject({
      status: "failed",
      summary: { conflictedPaths: ["src/base.txt"] },
    });
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe(
      "secret\n",
    );
  });
});
