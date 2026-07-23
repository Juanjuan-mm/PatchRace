import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId, type TrialId } from "@patchrace/contracts";

import { ArtifactStore, type RunManifest } from "./artifacts.js";
import { BudgetTracker } from "./budgets.js";
import { executeCleanup, planRunCleanup } from "./cleanup.js";
import { runProcess } from "./process.js";
import { recoverRun, RunCoordinator } from "./recovery.js";
import { createRedactedExport, Redactor } from "./redaction.js";
import { WorktreeManager, type WorktreeRecord } from "./worktrees.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

async function fixtureRepository(): Promise<{ root: string; commit: string }> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-m3-e2e-"));
  roots.push(root);
  await execute("git", ["init", "-q", root]);
  await writeFile(join(root, ".gitignore"), ".patchrace/\n");
  await writeFile(join(root, "message.txt"), "baseline\n");
  await execute("git", ["-C", root, "add", "."]);
  await execute("git", [
    "-C",
    root,
    "-c",
    "user.name=PatchRace",
    "-c",
    "user.email=fixture@patchrace.invalid",
    "commit",
    "-qm",
    "baseline",
  ]);
  return {
    root,
    commit: (
      await execute("git", ["-C", root, "rev-parse", "HEAD"])
    ).stdout.trim(),
  };
}

describe("M3 execution core end to end", () => {
  it("prepares, executes, interrupts, resumes idempotently, inspects/redacts artifacts, and cleans exact targets", async () => {
    const fixture = await fixtureRepository();
    const stateRoot = join(fixture.root, ".patchrace");
    const runId = "run_00000000000000000000000000" as RunId;
    const first = "trial_00000000000000000000000000" as TrialId;
    const second = "trial_00000000000000000000000001" as TrialId;
    const trials = [first, second];
    const manifest: Omit<RunManifest, "runId"> & { runId: RunId } = {
      schemaVersion: "1.0.0",
      runId,
      createdAt: new Date(0).toISOString(),
      planHash: canonicalHash({ commit: fixture.commit, trials }),
      source: { repository: { logicalPath: ".", commit: fixture.commit } },
      controller: { version: "0.0.0", node: process.version },
      budgets: {
        wallSeconds: 10,
        maxTrials: 2,
        maxTokens: null,
        maxCostUsd: null,
      },
      trials: trials.map((trialId) => ({
        trialId,
        paths: {
          worktree: `worktrees/${runId}/${trialId}`,
          artifacts: `trials/${trialId}`,
        },
      })),
      artifactIndexVersion: "1.0.0",
    };
    const store = await ArtifactStore.create({
      stateRoot,
      manifest,
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
    });
    const coordinator = new RunCoordinator(store, trials, () => new Date(0));
    const manager = await WorktreeManager.open(fixture.root, stateRoot);
    const worktrees: WorktreeRecord[] = [];
    const budgets = new BudgetTracker({
      wallMs: 10_000,
      maxTrials: 2,
      maxTokens: null,
      maxCostUsd: null,
      maxDiskBytes: 10 * 1024 * 1024,
    });
    await coordinator.initialize();
    await coordinator.transitionRun("preparing");

    budgets.reserveTrial();
    await coordinator.transitionTrial(first, "preparing");
    const firstWorktree = await manager.create({
      runId,
      trialId: first,
      commit: fixture.commit,
      now: () => new Date(0),
    });
    worktrees.push(firstWorktree);
    await store.appendJsonLine("local/worktrees.jsonl", firstWorktree);
    await coordinator.transitionRun("running");
    await coordinator.transitionTrial(first, "running");
    const invocation = await store.finalizeJson(
      `trials/${first}/invocation.json`,
      {
        schemaVersion: "1.0.0",
        executable: "node",
        argvHash: canonicalHash(["fixture"]),
        inheritedEnvironmentNames: ["PATH"],
      },
      { sensitivity: "local", producer: "m3-e2e" },
    );
    const firstProcess = await runProcess({
      executable: process.execPath,
      cwd: firstWorktree.path,
      args: [
        "-e",
        "require('node:fs').writeFileSync('message.txt','first\\n'); process.stdout.write('sk-abcdefghijklmnopqrstuvwxyz')",
      ],
      timeoutMs: 1000,
      maxOutputBytes: 1024,
      onStdout: (chunk) =>
        store.appendBytes(`trials/${first}/raw/stdout.log`, chunk),
      onStderr: (chunk) =>
        store.appendBytes(`trials/${first}/raw/stderr.log`, chunk),
    });
    expect(firstProcess.status).toBe("completed");
    const raw = await store.indexExisting(`trials/${first}/raw/stdout.log`, {
      mediaType: "text/plain",
      sensitivity: "local-sensitive",
      producer: "process-runner",
    });
    const firstResult = await store.finalizeJson(
      `trials/${first}/result.json`,
      {
        schemaVersion: "1.0.0",
        state: "completed",
        process: firstProcess,
        budget: budgets.snapshot(),
      },
      {
        sensitivity: "local",
        producer: "m3-e2e",
        dependencies: [invocation.hash, raw.hash],
      },
    );
    await coordinator.transitionTrial(first, "completed", [firstResult.hash]);

    // The controller is interrupted before the second trial starts; durable state remains readable.
    await coordinator.transitionRun("interrupted");
    const recovered = await recoverRun(store.runRoot, () => new Date(1));
    expect(recovered).toMatchObject({
      completedTrials: [first],
      resumableTrials: [second],
      needsInspection: false,
    });

    const resumedStore = await ArtifactStore.open(stateRoot, runId);
    const resumed = RunCoordinator.resume(
      resumedStore,
      recovered,
      () => new Date(2),
    );
    await resumed.transitionRun("preparing");
    budgets.reserveTrial();
    await resumed.transitionTrial(second, "preparing");
    const secondWorktree = await manager.create({
      runId,
      trialId: second,
      commit: fixture.commit,
      now: () => new Date(2),
    });
    worktrees.push(secondWorktree);
    await resumedStore.appendJsonLine("local/worktrees.jsonl", secondWorktree);
    await resumed.transitionRun("running");
    await resumed.transitionTrial(second, "running");
    const secondProcess = await runProcess({
      executable: process.execPath,
      cwd: secondWorktree.path,
      args: [
        "-e",
        "require('node:fs').writeFileSync('message.txt','second\\n')",
      ],
      timeoutMs: 1000,
    });
    const secondResult = await resumedStore.finalizeJson(
      `trials/${second}/result.json`,
      {
        schemaVersion: "1.0.0",
        state: secondProcess.status,
        process: secondProcess,
        budget: budgets.snapshot(),
      },
      { sensitivity: "local", producer: "m3-e2e" },
    );
    await resumed.transitionTrial(second, "completed", [secondResult.hash]);
    await resumed.transitionRun("completed", [
      firstResult.hash,
      secondResult.hash,
    ]);
    await expect(
      resumedStore.finalizeJson(
        `trials/${first}/result.json`,
        {},
        { sensitivity: "local", producer: "duplicate" },
      ),
    ).rejects.toMatchObject({ details: { code: "ARTIFACT_IMMUTABLE" } });
    await resumedStore.finalizeJson(
      "local/worktrees.json",
      { schemaVersion: "1.0.0", worktrees },
      { sensitivity: "local-sensitive", producer: "m3-e2e" },
    );
    await resumedStore.indexExisting(`trials/${first}/result.json`, {
      mediaType: "application/json",
      sensitivity: "local",
      producer: "m3-e2e",
    });
    await resumedStore.finalizeIndex();

    const exportRoot = join(stateRoot, "exports", runId);
    const exported = await createRedactedExport({
      sourceRoot: resumedStore.runRoot,
      destinationRoot: exportRoot,
      logicalPaths: [`trials/${first}/raw/stdout.log`],
      redactor: new Redactor(),
    });
    expect(exported.findings).toEqual([
      expect.objectContaining({ kind: "known-token", name: "openai" }),
    ]);
    expect(
      await readFile(
        join(exportRoot, `trials/${first}/raw/stdout.log`),
        "utf8",
      ),
    ).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");

    const cleanup = await planRunCleanup({
      stateRoot,
      runId,
      includeWorktrees: true,
      includeArtifacts: true,
    });
    expect(cleanup.targets.map(({ kind }) => kind)).toEqual([
      "worktree",
      "worktree",
      "artifacts",
    ]);
    const result = await executeCleanup(cleanup, { confirm: true });
    expect(result.removed).toHaveLength(3);
    await expect(access(resumedStore.runRoot)).rejects.toThrow();
    expect(await readFile(join(fixture.root, "message.txt"), "utf8")).toBe(
      "baseline\n",
    );
    await expect(manager.list()).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: firstWorktree.path }),
        expect.objectContaining({ path: secondWorktree.path }),
      ]),
    );
  });
});
