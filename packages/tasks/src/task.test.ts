import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  sha256,
  type TaskV1,
} from "@patchrace/contracts";

import { loadTask, serializeTask, validateTask } from "./task.js";

const temporaryDirectories: string[] = [];
const commit = "a".repeat(40);
const referencePatchHash = `sha256:${"b".repeat(64)}` as const;

async function fixture(): Promise<{
  readonly root: string;
  readonly task: TaskV1;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-task-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "setup"));
  await mkdir(join(root, "verifier"));
  const instruction = Buffer.from("Fix the calculator regression.\n");
  const setup = Buffer.from("fixture setup\n");
  const verifier = Buffer.from("fixture verifier\n");
  await writeFile(join(root, "instruction.md"), instruction);
  await writeFile(join(root, "setup", "input.txt"), setup);
  await writeFile(join(root, "verifier", "hidden.test.mjs"), verifier);
  return {
    root,
    task: {
      schemaVersion: SCHEMA_VERSION,
      id: "calculator-regression",
      revision: 1,
      baseline: {
        repository: ".",
        commit,
        submodules: "disabled",
        lfs: "disabled",
      },
      instruction: { file: "instruction.md", hash: sha256(instruction) },
      setup: {
        commands: [
          {
            id: "prepare",
            kind: "setup",
            argv: ["node", "--version"],
            timeoutSeconds: 10,
            network: "forbidden",
          },
        ],
        assets: [
          {
            source: "setup/input.txt",
            mount: "input.txt",
            hash: sha256(setup),
          },
        ],
      },
      verifier: {
        visibility: "public",
        assets: [
          {
            source: "verifier/hidden.test.mjs",
            mount: "test/__patchrace__/hidden.test.mjs",
            hash: sha256(verifier),
          },
        ],
        commands: [
          {
            id: "test",
            kind: "test",
            argv: ["node", "--test"],
            timeoutSeconds: 30,
          },
        ],
      },
      assertions: [
        { id: "tests", kind: "command", commandId: "test" },
        { id: "size", kind: "diff-limit", maxLines: 100 },
      ],
      budgets: {
        trialSeconds: 600,
        maxTokens: null,
        maxCostUsd: null,
        maxRecords: 25_000,
        maxPatchLines: 100,
      },
      provenance: {
        source: "manual",
        sourceCommit: commit,
        referencePatchHash,
        createdAt: "2026-07-22T00:00:00.000Z",
        reviewedBy: "user",
      },
      metadata: {
        ecosystem: "javascript",
        category: "bugfix",
        split: "validation",
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("versioned tasks", () => {
  it("loads JSON and hashes every referenced semantic input", async () => {
    const { root, task } = await fixture();
    const path = join(root, "task.json");
    await writeFile(path, serializeTask(task));

    const first = await loadTask(path);
    const second = await loadTask(path);

    expect(first.task).toEqual(task);
    expect(first.task.budgets.maxRecords).toBe(25_000);
    expect(first.referencedFiles.map((entry) => entry.role)).toEqual([
      "instruction",
      "setup",
      "verifier",
    ]);
    expect(first.taskHash).toBe(second.taskHash);
    expect(first.taskHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.canonicalJson).not.toContain(root);
  });

  it("loads the same contract from YAML", async () => {
    const { root, task } = await fixture();
    const path = join(root, "task.yaml");
    await writeFile(path, JSON.stringify(task));

    await expect(loadTask(path)).resolves.toMatchObject({
      task: { id: "calculator-regression", schemaVersion: SCHEMA_VERSION },
    });
  });

  it("requires hidden verifier assets to come from an explicit external root", async () => {
    const { root, task } = await fixture();
    const verifierRoot = await mkdtemp(
      join(tmpdir(), "patchrace-verifier-vault-"),
    );
    temporaryDirectories.push(verifierRoot);
    await mkdir(join(verifierRoot, "verifier"));
    const hidden = Buffer.from("external hidden verifier\n");
    await writeFile(join(verifierRoot, "verifier", "hidden.test.mjs"), hidden);
    const hiddenTask: TaskV1 = {
      ...task,
      verifier: {
        ...task.verifier,
        visibility: "hidden",
        assets: [
          {
            source: "verifier/hidden.test.mjs",
            mount: "test/__patchrace__/hidden.test.mjs",
            hash: sha256(hidden),
          },
        ],
      },
    };
    const path = join(root, "hidden-task.json");
    await writeFile(path, serializeTask(hiddenTask));

    await expect(loadTask(path)).rejects.toMatchObject({
      details: { code: "TASK_HIDDEN_VERIFIER_ROOT_REQUIRED" },
    });
    await expect(loadTask(path, { verifierRoot })).resolves.toMatchObject({
      referencedFiles: expect.arrayContaining([
        expect.objectContaining({
          role: "verifier",
          contentHash: sha256(hidden),
        }),
      ]),
    });
  });

  it("returns stable path-level schema and semantic issues", async () => {
    const { task } = await fixture();
    const unknown = { ...task, surprise: true };
    expect(validateTask(unknown)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TASK_SCHEMA_INVALID",
          path: "surprise",
        }),
      ]),
    );
    const missing = {
      ...task,
      assertions: [
        { id: "missing", kind: "command", commandId: "no-such-command" },
      ],
    };
    expect(validateTask(missing)).toEqual([
      expect.objectContaining({
        code: "TASK_COMMAND_REFERENCE_MISSING",
        path: "assertions[0].commandId",
      }),
    ]);
  });

  it("rejects changed content and symlink escapes", async () => {
    const { root, task } = await fixture();
    const path = join(root, "task.json");
    await writeFile(path, serializeTask(task));
    await writeFile(join(root, "instruction.md"), "tampered\n");
    await expect(loadTask(path)).rejects.toMatchObject({
      details: { code: "TASK_ASSET_HASH_MISMATCH" },
    });

    const outside = join(root, "..", `outside-${Date.now()}.md`);
    await writeFile(outside, "outside\n");
    temporaryDirectories.push(outside);
    await rm(join(root, "instruction.md"));
    await symlink(outside, join(root, "instruction.md"));
    const escaped = {
      ...task,
      instruction: { file: "instruction.md", hash: sha256("outside\n") },
    };
    await writeFile(path, serializeTask(escaped));
    await expect(loadTask(path)).rejects.toBeInstanceOf(PatchRaceError);
    await expect(loadTask(path)).rejects.toMatchObject({
      details: { code: "TASK_ASSET_PATH_UNSAFE" },
    });
  });
});
