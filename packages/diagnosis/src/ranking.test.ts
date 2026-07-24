import { describe, expect, it } from "vitest";

import {
  canonicalHash,
  type RaceExecutionV1,
  type RaceTrialResultV1,
  type RaceVariantV1,
  type TrialId,
} from "@patchrace/contracts";

import { rankRace } from "./ranking.js";

function variant(variantId: string): RaceVariantV1 {
  return {
    variantId,
    variantHash: canonicalHash({ variantId }),
    adapter: {
      id: variantId,
      kind: variantId,
      executable: variantId,
      version: "1",
    },
    model: null,
    harness: {},
    workflow: {},
    environmentNames: [],
  };
}

function trial(
  variant: RaceVariantV1,
  suffix: string,
  options: {
    readonly passed: boolean;
    readonly cost: number | null;
    readonly latency: number;
  },
): RaceTrialResultV1 {
  return {
    schemaVersion: "1.0.0",
    trialId: `trial_01J0000000000000000000000${suffix}` as TrialId,
    taskId: "task",
    taskHash: canonicalHash("task"),
    baselineCommit: "a".repeat(40),
    variantId: variant.variantId,
    variantHash: variant.variantHash,
    repetition: Number(suffix),
    attempt: 1,
    supersedesTrialId: null,
    terminalStatus: "completed",
    integrity: "valid",
    outcome: options.passed ? "passed" : "failed",
    hardGates: [
      {
        id: "tests",
        status: options.passed ? "passed" : "failed",
        evidence: ["grade.json"],
      },
    ],
    metrics: {
      durationMs: {
        value: options.latency,
        unit: "ms",
        availability: "derived",
        source: "controller",
      },
      costUsd: {
        value: options.cost,
        unit: "USD",
        availability: options.cost === null ? "unavailable" : "observed",
        source: "adapter",
      },
      tokens: {
        value: null,
        unit: "tokens",
        availability: "unavailable",
        source: "adapter",
      },
      footprintLines: {
        value: 4,
        unit: "lines",
        availability: "derived",
        source: "patch",
      },
    },
    artifacts: {
      patch: "patch.diff",
      grade: "grade.json",
      trace: "trace.jsonl",
      result: "result.json",
    },
    limitations: [],
  };
}

function execution(
  variants: readonly RaceVariantV1[],
  trials: readonly RaceTrialResultV1[],
): RaceExecutionV1 {
  return {
    schemaVersion: "1.0.0",
    plan: {
      schemaVersion: "1.0.0",
      planHash: canonicalHash("plan"),
      comparisonDimensions: ["model", "harness", "workflow"],
      tasks: [
        {
          taskId: "task",
          taskHash: canonicalHash("task"),
          baselineCommit: "a".repeat(40),
          instructionHash: canonicalHash("instruction"),
        },
      ],
      variants,
      repeat: 2,
      budgets: { maxTrials: trials.length },
      trials: trials.map(
        ({
          terminalStatus: _terminalStatus,
          integrity: _integrity,
          outcome: _outcome,
          hardGates: _hardGates,
          metrics: _metrics,
          artifacts: _artifacts,
          limitations: _limitations,
          schemaVersion: _schemaVersion,
          ...plan
        }) => plan,
      ),
    },
    status: "completed",
    trials,
    scheduler: trials.map((value) => ({
      trialId: value.trialId,
      status: "completed",
      errorCode: null,
    })),
  };
}

describe("correctness-first ranking", () => {
  it("never lets lower cost rescue a failed hard gate", () => {
    const correct = variant("correct");
    const cheap = variant("cheap");
    const result = rankRace(
      execution(
        [correct, cheap],
        [
          trial(correct, "01", { passed: true, cost: 10, latency: 100 }),
          trial(correct, "02", { passed: true, cost: 10, latency: 100 }),
          trial(cheap, "03", { passed: true, cost: 1, latency: 10 }),
          trial(cheap, "04", { passed: false, cost: 1, latency: 10 }),
        ],
      ),
    );
    expect(result.variants.map((value) => value.variantId)).toEqual([
      "correct",
      "cheap",
    ]);
    expect(result.variants[1]?.decisiveDimension).toBe("hard-gates");
  });

  it("uses configured post-gate order and preserves raw unavailable cost", () => {
    const fast = variant("fast");
    const unknown = variant("unknown");
    const result = rankRace(
      execution(
        [unknown, fast],
        [
          trial(fast, "01", { passed: true, cost: 2, latency: 20 }),
          trial(fast, "02", { passed: true, cost: 2, latency: 20 }),
          trial(unknown, "03", { passed: true, cost: null, latency: 50 }),
          trial(unknown, "04", { passed: true, cost: null, latency: 50 }),
        ],
      ),
      {
        schemaVersion: "1.0.0",
        id: "latency-first-after-correctness",
        first: "hard-gates",
        afterHardGates: ["latency", "cost"],
      },
    );
    expect(result.variants[0]?.variantId).toBe("fast");
    expect(result.variants[1]?.aggregate.raw.meanCostUsd).toMatchObject({
      value: null,
      availability: "unavailable",
    });
  });
});
