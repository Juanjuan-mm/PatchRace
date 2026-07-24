import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId, type TrialId } from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import { recoverRun, RunCoordinator } from "./recovery.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("run recovery", () => {
  it("serializes concurrent trial transitions into a contiguous event log", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-recovery-"));
    roots.push(parent);
    const first = "trial_00000000000000000000000000" as TrialId;
    const second = "trial_00000000000000000000000001" as TrialId;
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId: "run_00000000000000000000000000" as RunId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [{ trialId: first }, { trialId: second }],
        artifactIndexVersion: "1.0.0",
      },
    });
    const coordinator = new RunCoordinator(store, [first, second]);
    await coordinator.initialize();
    await Promise.all([
      coordinator.transitionTrial(first, "running"),
      coordinator.transitionTrial(second, "running"),
    ]);
    await Promise.all([
      coordinator.transitionTrial(first, "completed"),
      coordinator.transitionTrial(second, "completed"),
    ]);

    const events = (await readFile(join(store.runRoot, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { sequence: number });
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("truncates only an invalid final partial record and never resumes a completed trial", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-recovery-"));
    roots.push(parent);
    const first = "trial_00000000000000000000000000" as TrialId;
    const second = "trial_00000000000000000000000001" as TrialId;
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId: "run_00000000000000000000000000" as RunId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [{ trialId: first }, { trialId: second }],
        artifactIndexVersion: "1.0.0",
      },
    });
    const coordinator = new RunCoordinator(
      store,
      [first, second],
      () => new Date(0),
    );
    await coordinator.initialize();
    await coordinator.transitionTrial(first, "running");
    await coordinator.transitionTrial(first, "completed");
    await appendFile(join(store.runRoot, "events.jsonl"), '{"partial":');

    const recovered = await recoverRun(store.runRoot, () => new Date(1));

    expect(recovered).toMatchObject({
      completedTrials: [first],
      resumableTrials: [second],
      needsInspection: false,
    });
    expect(recovered.truncatedBytes).toBeGreaterThan(0);
    await expect(
      coordinator.transitionTrial(first, "completed"),
    ).rejects.toMatchObject({ details: { code: "TRIAL_ALREADY_TERMINAL" } });
  });

  it("retains complete malformed evidence and marks the run for inspection", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-recovery-"));
    roots.push(parent);
    const trialId = "trial_00000000000000000000000000" as TrialId;
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId: "run_00000000000000000000000000" as RunId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [{ trialId }],
        artifactIndexVersion: "1.0.0",
      },
    });
    await appendFile(join(store.runRoot, "events.jsonl"), '{"broken":}\n');

    const recovered = await recoverRun(store.runRoot, () => new Date(1));

    expect(recovered).toMatchObject({
      needsInspection: true,
      resumableTrials: [],
      truncatedBytes: 0,
    });
    expect(recovered.reasons).toContain("event line 2 contains invalid JSON");
    expect(
      await readFile(join(store.runRoot, "events.jsonl"), "utf8"),
    ).toContain('{"broken":}\n');
  });

  it("turns a corrupt finalized index into inspection evidence instead of discarding the run", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-recovery-"));
    roots.push(parent);
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId: "run_00000000000000000000000000" as RunId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [],
        artifactIndexVersion: "1.0.0",
      },
    });
    await store.finalizeIndex();
    await writeFile(join(store.runRoot, "artifact-index.json"), '{"broken":');

    const recovered = await recoverRun(store.runRoot, () => new Date(1));

    expect(recovered.needsInspection).toBe(true);
    expect(recovered.reasons).toContain(
      "artifact-index is invalid (invalid JSON)",
    );
    expect(
      await readFile(join(store.runRoot, "artifact-index.json"), "utf8"),
    ).toBe('{"broken":');
  });
});
