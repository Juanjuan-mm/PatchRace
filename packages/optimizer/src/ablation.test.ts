import { describe, expect, it, vi } from "vitest";

import {
  PatchRaceError,
  sha256,
  type CandidateSnapshotV1,
} from "@patchrace/contracts";

import {
  assertOneVariableAblation,
  createAblationPlan,
  runAblationPlan,
} from "./ablation.js";

const before = sha256("before");
const after = sha256("after");
const candidate: CandidateSnapshotV1 = {
  schemaVersion: "1.0.0",
  candidateSchemaVersion: "1.0.0",
  candidateId: "cand_1234567890abcdef1234",
  candidateHash: sha256("candidate"),
  parentCandidateId: null,
  baselineId: "pi-main",
  createdAt: "2026-07-23T00:00:00Z",
  generator: {
    kind: "builtin-bounded-v1",
    id: "fixture",
    version: "1",
    model: null,
    promptHash: null,
    deterministic: true,
  },
  inputs: {
    routeIds: ["route"],
    diagnosisIds: ["diag"],
    evidenceHashes: [sha256("evidence")],
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
  },
  mutation: {
    type: "agents-guidance",
    declaredVariable: "one-fact",
    files: [
      {
        logicalPath: "AGENTS.md",
        operation: "update",
        beforeHash: before,
        afterHash: after,
        patchHash: sha256("patch"),
      },
    ],
  },
  objective: {
    policy: "correctness-first-v1",
    primary: "task-success-rate",
    constraints: {},
  },
  evaluationHistory: [],
  decision: { state: "approved", reason: "explicit-review" },
};

function plan() {
  return createAblationPlan({
    candidate,
    phase: "validation",
    taskSnapshots: [
      { taskId: "task-b", taskHash: sha256("task-b") },
      { taskId: "task-a", taskHash: sha256("task-a") },
    ],
    invariant: {
      adapterId: "pi",
      adapterVersion: "fixture",
      model: "model-a",
      harnessHash: sha256("harness"),
      budgetsHash: sha256("budgets"),
      environmentNames: ["CI", "PATH"],
      schedulerHash: sha256("scheduler"),
    },
    baseline: { variantId: "pi-main", resourceHash: sha256("resources-a") },
    candidateResourceHash: sha256("resources-b"),
    repetitionCount: 2,
  });
}

describe("one-variable ablation", () => {
  it("freezes identical invariants and balances paired execution order", () => {
    const value = plan();

    expect(value.taskSnapshots.map((task) => task.taskId)).toEqual([
      "task-a",
      "task-b",
    ]);
    expect(value.trials).toHaveLength(8);
    expect(
      value.trials
        .filter((trial) => trial.repetition === 1)
        .map((trial) => trial.arm),
    ).toEqual(["baseline", "candidate", "baseline", "candidate"]);
    expect(
      value.trials
        .filter((trial) => trial.repetition === 2)
        .map((trial) => trial.arm),
    ).toEqual(["candidate", "baseline", "candidate", "baseline"]);
  });

  it("fails contamination before invoking an evaluator", async () => {
    const value = plan();
    const evaluate = vi.fn();

    await expect(
      runAblationPlan({
        plan: value,
        baselineSnapshot: {
          files: [
            { logicalPath: "AGENTS.md", hash: before },
            { logicalPath: "other.md", hash: sha256("same") },
          ],
        },
        candidateSnapshot: {
          files: [
            { logicalPath: "AGENTS.md", hash: after },
            { logicalPath: "other.md", hash: sha256("hidden-change") },
          ],
        },
        evaluate,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("runs only after the exact declared mutation passes validation", async () => {
    const value = plan();
    expect(
      assertOneVariableAblation({
        plan: value,
        baseline: { files: [{ logicalPath: "AGENTS.md", hash: before }] },
        candidate: { files: [{ logicalPath: "AGENTS.md", hash: after }] },
      }),
    ).toContain("no_extra_resource_changes_detected");

    const result = await runAblationPlan({
      plan: value,
      baselineSnapshot: {
        files: [{ logicalPath: "AGENTS.md", hash: before }],
      },
      candidateSnapshot: {
        files: [{ logicalPath: "AGENTS.md", hash: after }],
      },
      evaluate: async (trial) => ({
        trialKey: trial.trialKey,
        arm: trial.arm,
        status: "passed",
        hardGatesPassed: true,
        sourceArtifactHashes: [sha256(trial.trialKey)],
        limitations: [],
      }),
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "completed" });
    expect(result.outcomes).toHaveLength(value.trials.length);
  });
});
