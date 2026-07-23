import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  sha256,
  type RunId,
  type TaskV1,
  type TrialId,
} from "@patchrace/contracts";
import { WorktreeManager } from "@patchrace/core";

import { runHiddenVerifier } from "./hidden-verifier.js";
import { loadTask, serializeTask } from "./task.js";

const execute = promisify(execFile);
const roots: string[] = [];
const runId = "run_00000000000000000000000000" as RunId;
const agentTrialId = "trial_00000000000000000000000000" as TrialId;
const graderTrialId = "trial_00000000000000000000000001" as TrialId;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{
  readonly root: string;
  readonly commit: string;
  readonly manager: WorktreeManager;
  readonly loaded: Awaited<ReturnType<typeof loadTask>>;
  readonly vaultFile: string;
  readonly evidence: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-hidden-repo-"));
  const bundle = await mkdtemp(join(tmpdir(), "patchrace-hidden-task-"));
  const vault = await mkdtemp(join(tmpdir(), "patchrace-hidden-vault-"));
  const evidence = await mkdtemp(join(tmpdir(), "patchrace-hidden-evidence-"));
  roots.push(root, bundle, vault, evidence);
  await execute("git", ["init", "-q", "-b", "main"], { cwd: root });
  await execute("git", ["config", "user.name", "PatchRace Fixture"], {
    cwd: root,
  });
  await execute("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: root,
  });
  await mkdir(join(root, "src"));
  await writeFile(join(root, ".gitignore"), ".patchrace/\n");
  await writeFile(join(root, "README.md"), "preserve\n");
  await writeFile(
    join(root, "src", "add.mjs"),
    "export const add = (a, b) => a - b;\n",
  );
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "baseline"], { cwd: root });
  const commit = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await writeFile(join(bundle, "instruction.md"), "Fix add.\n");
  await mkdir(join(vault, "verifier"));
  const hidden = Buffer.from(
    "import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises'; import { add } from '../../src/add.mjs'; test('hidden', async () => { assert.equal(add(1, 2), 3); assert.equal((await readFile('extra.txt', 'utf8')).trim(), 'agent-extra'); });\n",
  );
  const vaultFile = join(vault, "verifier", "hidden.test.mjs");
  await writeFile(vaultFile, hidden);
  const task: TaskV1 = {
    schemaVersion: SCHEMA_VERSION,
    id: "hidden-add",
    revision: 1,
    baseline: {
      repository: ".",
      commit,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: { file: "instruction.md", hash: sha256("Fix add.\n") },
    setup: { commands: [], assets: [] },
    verifier: {
      visibility: "hidden",
      assets: [
        {
          source: "verifier/hidden.test.mjs",
          mount: "test/__patchrace__/hidden.test.mjs",
          hash: sha256(hidden),
        },
      ],
      commands: [
        {
          id: "hidden-test",
          kind: "test",
          argv: [
            process.execPath,
            "--test",
            "test/__patchrace__/hidden.test.mjs",
          ],
          timeoutSeconds: 10,
          network: "forbidden",
        },
      ],
    },
    assertions: [],
    budgets: {
      trialSeconds: 60,
      graderSeconds: 30,
      maxTokens: null,
      maxCostUsd: null,
      maxPatchLines: 100,
      maxOutputBytes: 1024 * 1024,
    },
    provenance: {
      source: "manual",
      sourceCommit: commit,
      referencePatchHash: sha256(""),
      verifierOrigin: "external-fixture-vault",
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "user",
    },
    metadata: {},
  };
  const taskPath = join(bundle, "task.json");
  await writeFile(taskPath, serializeTask(task));
  const loaded = await loadTask(taskPath, { verifierRoot: vault });
  const manager = await WorktreeManager.open(root, join(root, ".patchrace"));
  return { root, commit, manager, loaded, vaultFile, evidence };
}

describe("runHiddenVerifier", () => {
  it("grades an exact tracked/untracked snapshot and cleans only the grader worktree", async () => {
    const value = await fixture();
    const agent = await value.manager.create({
      runId,
      trialId: agentTrialId,
      commit: value.commit,
    });
    await writeFile(
      join(agent.path, "src", "add.mjs"),
      "export const add = (a, b) => a + b;\n",
    );
    await writeFile(join(agent.path, "extra.txt"), "agent-extra\n");
    await expect(
      readFile(join(agent.path, "test", "__patchrace__", "hidden.test.mjs")),
    ).rejects.toThrow();

    const result = await runHiddenVerifier({
      task: value.loaded,
      manager: value.manager,
      agentWorktree: agent,
      graderRunId: runId,
      graderTrialId,
      evidenceDirectory: value.evidence,
      agentProcessStopped: true,
    });

    expect(result).toMatchObject({
      verifier: {
        status: "passed",
        commands: [{ id: "hidden-test", status: "passed" }],
      },
      graderWorktreeCleaned: true,
      injectedAssets: [{ mount: "test/__patchrace__/hidden.test.mjs" }],
    });
    expect(result.agentPatchHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      (await value.manager.list()).some((item) =>
        item.path.includes(graderTrialId),
      ),
    ).toBe(false);
    expect(await readFile(join(agent.path, "extra.txt"), "utf8")).toBe(
      "agent-extra\n",
    );
    expect(await readFile(join(value.root, "README.md"), "utf8")).toBe(
      "preserve\n",
    );
    await value.manager.cleanup(agent, { confirm: true, allowDirty: true });
  });

  it("refuses a running agent before creating grader state", async () => {
    const value = await fixture();
    const agent = await value.manager.create({
      runId,
      trialId: agentTrialId,
      commit: value.commit,
    });
    await expect(
      runHiddenVerifier({
        task: value.loaded,
        manager: value.manager,
        agentWorktree: agent,
        graderRunId: runId,
        graderTrialId,
        evidenceDirectory: value.evidence,
        agentProcessStopped: false,
      }),
    ).rejects.toMatchObject({
      details: { code: "HIDDEN_VERIFIER_AGENT_STILL_RUNNING" },
    });
    expect(
      (await value.manager.list()).filter((item) =>
        item.path.includes("trial_"),
      ).length,
    ).toBe(1);
  });

  it("retains grader evidence on mount collision and post-load vault tampering", async () => {
    const collision = await fixture();
    const agent = await collision.manager.create({
      runId,
      trialId: agentTrialId,
      commit: collision.commit,
    });
    await mkdir(join(agent.path, "test", "__patchrace__"), { recursive: true });
    await writeFile(
      join(agent.path, "test", "__patchrace__", "hidden.test.mjs"),
      "forged\n",
    );
    await expect(
      runHiddenVerifier({
        task: collision.loaded,
        manager: collision.manager,
        agentWorktree: agent,
        graderRunId: runId,
        graderTrialId,
        evidenceDirectory: collision.evidence,
        agentProcessStopped: true,
      }),
    ).rejects.toMatchObject({
      details: { code: "HIDDEN_VERIFIER_AGENT_COLLISION" },
    });
    expect(
      (await collision.manager.list()).some((item) =>
        item.path.includes(graderTrialId),
      ),
    ).toBe(true);

    const tampered = await fixture();
    const secondAgent = await tampered.manager.create({
      runId,
      trialId: agentTrialId,
      commit: tampered.commit,
    });
    await writeFile(tampered.vaultFile, "tampered\n");
    await expect(
      runHiddenVerifier({
        task: tampered.loaded,
        manager: tampered.manager,
        agentWorktree: secondAgent,
        graderRunId: runId,
        graderTrialId,
        evidenceDirectory: tampered.evidence,
        agentProcessStopped: true,
      }),
    ).rejects.toMatchObject({
      details: { code: "HIDDEN_VERIFIER_HASH_MISMATCH" },
    });
    expect(await readFile(join(tampered.root, "README.md"), "utf8")).toBe(
      "preserve\n",
    );
  });
});
