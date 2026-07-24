import { describe, expect, it } from "vitest";

import { PatchRaceError } from "@patchrace/contracts";

import {
  createSuccessiveHalvingPlan,
  decideHalvingRound,
} from "./successive-halving.js";

function plan() {
  return createSuccessiveHalvingPlan({
    candidateIds: ["cand-c", "cand-a", "cand-b", "cand-d"],
    taskIds: ["task-4", "task-2", "task-1", "task-3"],
    reductionFactor: 2,
    maxRepetitions: 2,
    budgets: {
      maxCandidates: 4,
      maxTrials: 100,
      maxWallTimeMs: 100_000,
      maxTokens: 100_000,
      maxCostUsd: 20,
    },
    perTrial: {
      maxWallTimeMs: 1_000,
      maxTokens: 1_000,
      maxCostUsd: 0.2,
    },
  });
}

describe("budgeted successive halving", () => {
  it("allocates cheap early screens and more evidence to fewer survivors", () => {
    const value = plan();

    expect(value.candidateIds).toEqual([
      "cand-a",
      "cand-b",
      "cand-c",
      "cand-d",
    ]);
    expect(value.rounds[0]).toMatchObject({
      candidateLimit: 4,
      taskIds: ["task-1"],
      repetitions: 1,
      trialsPerCandidate: 1,
    });
    expect(value.rounds[1]).toMatchObject({
      candidateLimit: 2,
      taskIds: ["task-1", "task-2"],
      repetitions: 2,
      trialsPerCandidate: 4,
    });
  });

  it("rejects hard-gate regressions and labels weak candidates early-stopped", () => {
    const value = plan();
    const decision = decideHalvingRound({
      plan: value,
      round: 1,
      activeCandidateIds: value.candidateIds,
      outcomes: [
        {
          candidateId: "cand-a",
          completedTrials: 1,
          hardGateRegression: false,
          successRate: 1,
          wallTimeMs: 500,
          tokens: 100,
          costUsd: 0.01,
        },
        {
          candidateId: "cand-b",
          completedTrials: 1,
          hardGateRegression: false,
          successRate: 0.8,
          wallTimeMs: 500,
          tokens: 100,
          costUsd: 0.01,
        },
        {
          candidateId: "cand-c",
          completedTrials: 1,
          hardGateRegression: false,
          successRate: 0.2,
          wallTimeMs: 500,
          tokens: 100,
          costUsd: 0.01,
        },
        {
          candidateId: "cand-d",
          completedTrials: 1,
          hardGateRegression: true,
          successRate: 1,
          wallTimeMs: 500,
          tokens: 100,
          costUsd: 0.01,
        },
      ],
    });

    expect(decision.survivors).toEqual(["cand-a", "cand-b"]);
    expect(decision.earlyStopped).toEqual([
      {
        candidateId: "cand-c",
        reason: "lower-correctness-screen-at-this-round",
        fullyEvaluated: false,
      },
    ]);
    expect(decision.rejected).toEqual([
      { candidateId: "cand-d", reason: "hard-gate-regression" },
    ]);
  });

  it("refuses unenforceable or insufficient budgets", () => {
    expect(() =>
      createSuccessiveHalvingPlan({
        candidateIds: ["cand-a"],
        taskIds: ["task-a"],
        budgets: {
          maxCandidates: 1,
          maxTrials: 1,
          maxWallTimeMs: 1_000,
          maxTokens: null,
          maxCostUsd: 1,
        },
        perTrial: {
          maxWallTimeMs: 1_000,
          maxTokens: null,
          maxCostUsd: null,
        },
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      createSuccessiveHalvingPlan({
        candidateIds: ["cand-a"],
        taskIds: ["task-a"],
        budgets: {
          maxCandidates: 1,
          maxTrials: 1,
          maxWallTimeMs: 10,
          maxTokens: null,
          maxCostUsd: null,
        },
        perTrial: {
          maxWallTimeMs: 1_000,
          maxTokens: null,
          maxCostUsd: null,
        },
      }),
    ).toThrowError(PatchRaceError);
  });
});
