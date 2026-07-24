import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  canonicalHash,
  sha256,
  type RunId,
  type TaskV1,
  type TrialId,
} from "@patchrace/contracts";
import { WorktreeManager } from "@patchrace/core";

import { checkGraderIntegrity } from "./integrity.js";
import { createTaskSplit } from "./split.js";
import { loadTask, serializeTask } from "./task.js";

const execute = promisify(execFile);
const roots: string[] = [];
const runId = "run_00000000000000000000000000" as RunId;
const trialId = "trial_00000000000000000000000000" as TrialId;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{
  readonly root: string;
  readonly vault: string;
  readonly vaultFile: string;
  readonly hidden: string;
  readonly loaded: Awaited<ReturnType<typeof loadTask>>;
  readonly manager: WorktreeManager;
  readonly agent: Awaited<ReturnType<WorktreeManager["create"]>>;
  readonly configHash: `sha256:${string}`;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-integrity-repo-"));
  const bundle = await mkdtemp(join(tmpdir(), "patchrace-integrity-task-"));
  const vault = await mkdtemp(join(tmpdir(), "patchrace-integrity-vault-"));
  roots.push(root, bundle, vault);
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
  await writeFile(join(root, "src", "value.mjs"), "export const value = 1;\n");
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "baseline"], { cwd: root });
  const commit = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  const instruction = "Change the exported value.\n";
  const hidden =
    "import assert from 'node:assert/strict'; assert.equal(2, 2); // private-marker-7f8d\n";
  await writeFile(join(bundle, "instruction.md"), instruction);
  await mkdir(join(vault, "verifier"));
  const vaultFile = join(vault, "verifier", "hidden.test.mjs");
  await writeFile(vaultFile, hidden);
  const task: TaskV1 = {
    schemaVersion: SCHEMA_VERSION,
    id: "integrity-value",
    revision: 1,
    baseline: {
      repository: ".",
      commit,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: { file: "instruction.md", hash: sha256(instruction) },
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
    assertions: [
      {
        id: "protect-score",
        kind: "protected-paths",
        paths: ["grading/**"],
      },
    ],
    budgets: {
      trialSeconds: 60,
      maxTokens: null,
      maxCostUsd: null,
      maxPatchLines: 100,
    },
    provenance: {
      source: "manual",
      sourceCommit: commit,
      referencePatchHash: sha256(""),
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "user",
    },
    metadata: { category: "javascript" },
  };
  const taskPath = join(bundle, "task.json");
  await writeFile(taskPath, serializeTask(task));
  const loaded = await loadTask(taskPath, { verifierRoot: vault });
  const manager = await WorktreeManager.open(root, join(root, ".patchrace"));
  const agent = await manager.create({ runId, trialId, commit });
  return {
    root,
    vault,
    vaultFile,
    hidden,
    loaded,
    manager,
    agent,
    configHash: canonicalHash({ grader: "deterministic-v1" }),
  };
}

describe("checkGraderIntegrity", () => {
  it("validates immutable inputs and clean protected boundaries under enforced isolation", async () => {
    const value = await fixture();
    const report = await checkGraderIntegrity({
      task: value.loaded,
      expectedTaskHash: value.loaded.taskHash,
      expectedConfigHash: value.configHash,
      actualConfigHash: value.configHash,
      manager: value.manager,
      agentWorktree: value.agent,
      isolation: "enforced-filesystem",
      agentInputs: [{ surface: "instruction", content: "Change the value." }],
    });

    expect(report).toMatchObject({ status: "valid", findings: [] });
    expect(report.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await value.manager.cleanup(value.agent, { confirm: true });
  });

  it("reports host-only hidden verification as unknown, not valid", async () => {
    const value = await fixture();
    const report = await checkGraderIntegrity({
      task: value.loaded,
      expectedTaskHash: value.loaded.taskHash,
      expectedConfigHash: value.configHash,
      actualConfigHash: value.configHash,
      manager: value.manager,
      agentWorktree: value.agent,
      isolation: "host-only",
    });

    expect(report.status).toBe("unknown");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "host-filesystem-not-enforced",
        severity: "limitation",
      }),
    );
    await value.manager.cleanup(value.agent, { confirm: true });
  });

  it("hard-fails protected paths and hidden data disclosed through prompts or patch files", async () => {
    const value = await fixture();
    await mkdir(join(value.agent.path, ".patchrace"));
    await writeFile(
      join(value.agent.path, ".patchrace", "scoring.json"),
      "{}\n",
    );
    await mkdir(join(value.agent.path, "test", "__patchrace__"), {
      recursive: true,
    });
    await writeFile(
      join(value.agent.path, "test", "__patchrace__", "hidden.test.mjs"),
      "forged\n",
    );
    await writeFile(join(value.agent.path, "leak.txt"), value.hidden);

    const report = await checkGraderIntegrity({
      task: value.loaded,
      expectedTaskHash: value.loaded.taskHash,
      expectedConfigHash: value.configHash,
      actualConfigHash: value.configHash,
      manager: value.manager,
      agentWorktree: value.agent,
      isolation: "enforced-filesystem",
      agentInputs: [
        {
          surface: "agent-prompt",
          content: `Use ${value.loaded.task.verifier.assets[0]!.hash} at test/__patchrace__/hidden.test.mjs`,
        },
      ],
    });

    expect(report.status).toBe("compromised");
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "protected-path-modified",
        "hidden-mount-collision",
        "hidden-data-in-agent-input",
        "hidden-content-in-agent-patch",
      ]),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(value.hidden);
    expect(serialized).not.toContain(value.vaultFile);
    expect(await readFile(join(value.root, "README.md"), "utf8")).toBe(
      "preserve\n",
    );
    await value.manager.cleanup(value.agent, {
      confirm: true,
      allowDirty: true,
    });
  });

  it("hard-fails input drift, configuration drift, visible hidden roots, and split misuse", async () => {
    const value = await fixture();
    await writeFile(value.vaultFile, `${value.hidden}// changed\n`);
    const manifest = createTaskSplit({
      seed: "fixed",
      tasks: [
        { id: "a", taskHash: sha256("a"), category: "one" },
        { id: "b", taskHash: sha256("b"), category: "one" },
        { id: "c", taskHash: sha256("c"), category: "one" },
      ],
    });
    const forbidden = manifest.assignments.holdout[0]!;
    const report = await checkGraderIntegrity({
      task: value.loaded,
      expectedTaskHash: sha256("different-task"),
      expectedConfigHash: value.configHash,
      actualConfigHash: sha256("different-config"),
      manager: value.manager,
      agentWorktree: value.agent,
      isolation: "enforced-filesystem",
      agentVisibleRoots: [value.vault],
      splitAccess: {
        manifest,
        phase: "candidate-generation",
        taskIds: [forbidden],
      },
    });

    expect(report.status).toBe("compromised");
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "task-hash-mismatch",
        "config-hash-mismatch",
        "referenced-asset-hash-mismatch",
        "task-input-drift",
        "hidden-source-agent-visible",
        "split-access-violation",
      ]),
    );
    await value.manager.cleanup(value.agent, { confirm: true });
  });
});
