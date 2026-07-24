import { describe, expect, it } from "vitest";

import {
  canonicalHash,
  type RaceTaskSnapshotV1,
  type RaceTrialResultV1,
  type TrialId,
} from "@patchrace/contracts";

import { createRacePlan, executeRacePlan } from "./race.js";

const task: RaceTaskSnapshotV1 = {
  taskId: "add-regression",
  taskHash: canonicalHash({ task: "add-regression" }),
  baselineCommit: "a".repeat(40),
  instructionHash: canonicalHash("fix it"),
};

function ids(): () => TrialId {
  let sequence = 0;
  return () =>
    `trial_01J0000000000000000000000${String(++sequence).padStart(2, "0")}` as TrialId;
}

describe("race orchestration", () => {
  it("freezes one snapshot across independently identified variant dimensions", () => {
    const plan = createRacePlan({
      tasks: [task],
      variants: [
        {
          variantId: "pi-model-a",
          adapter: {
            id: "pi",
            kind: "pi",
            executable: "pi",
            version: "0.81.1",
          },
          model: "model-a",
          harness: { resources: "project" },
          workflow: { candidate: null },
        },
        {
          variantId: "pi-workflow-b",
          adapter: {
            id: "pi",
            kind: "pi",
            executable: "pi",
            version: "0.81.1",
          },
          model: "model-a",
          harness: { resources: "project" },
          workflow: { candidate: "skill-b" },
        },
      ],
      repeat: 2,
      maxTrials: 4,
      createTrialId: ids(),
    });

    expect(plan.trials).toHaveLength(4);
    expect(new Set(plan.trials.map((trial) => trial.taskHash))).toEqual(
      new Set([task.taskHash]),
    );
    expect(plan.comparisonDimensions).toEqual(["model", "harness", "workflow"]);
    expect(plan.variants[0]?.variantHash).not.toBe(
      plan.variants[1]?.variantHash,
    );
    expect(plan.planHash).toBe(
      createRacePlan({
        tasks: [task],
        variants: [...plan.variants].reverse().map((variant) => ({
          variantId: variant.variantId,
          adapter: variant.adapter,
          model: variant.model,
          harness: variant.harness,
          workflow: variant.workflow,
          environmentNames: variant.environmentNames,
        })),
        repeat: 2,
        maxTrials: 4,
        createTrialId: ids(),
      }).planHash,
    );
  });

  it("enforces maxTrials before allocating paid work", () => {
    expect(() =>
      createRacePlan({
        tasks: [task],
        variants: [
          {
            variantId: "pi",
            adapter: {
              id: "pi",
              kind: "pi",
              executable: "pi",
              version: null,
            },
            model: null,
            harness: {},
            workflow: {},
          },
        ],
        repeat: 2,
        maxTrials: 1,
      }),
    ).toThrowError(/plans 2 trials/);
  });

  it("includes declared budget provenance in plan identity", () => {
    const input = {
      tasks: [task],
      variants: [
        {
          variantId: "pi",
          adapter: {
            id: "pi",
            kind: "pi",
            executable: "pi",
            version: null,
          },
          model: null,
          harness: {},
          workflow: {},
        },
      ],
      maxTrials: 1,
    } as const;
    const first = createRacePlan({
      ...input,
      budgetIdentity: { wallSeconds: 10, maxTrials: 1 },
      createTrialId: ids(),
    });
    const second = createRacePlan({
      ...input,
      budgetIdentity: { wallSeconds: 20, maxTrials: 1 },
      createTrialId: ids(),
    });
    expect(first.planHash).not.toBe(second.planHash);
  });

  it("executes injected trials concurrently and retains per-trial outcomes", async () => {
    const plan = createRacePlan({
      tasks: [task],
      variants: [
        {
          variantId: "pi",
          adapter: {
            id: "pi",
            kind: "pi",
            executable: "pi",
            version: null,
          },
          model: null,
          harness: {},
          workflow: {},
        },
      ],
      repeat: 2,
      maxTrials: 2,
      createTrialId: ids(),
    });
    const execution = await executeRacePlan({
      plan,
      concurrency: 2,
      budgets: {
        wallMs: 10_000,
        maxTrials: 2,
        maxTokens: null,
        maxCostUsd: null,
        maxDiskBytes: null,
      },
      executeTrial: async (trial, context): Promise<RaceTrialResultV1> => {
        context.reportUsage({ tokens: null, costUsd: null, diskBytes: 1 });
        return {
          schemaVersion: "1.0.0",
          ...trial,
          terminalStatus: "completed",
          integrity: "unknown",
          outcome: "passed",
          hardGates: [
            { id: "tests", status: "passed", evidence: ["grade.json"] },
          ],
          metrics: {
            durationMs: {
              value: 10,
              unit: "ms",
              availability: "derived",
              source: "controller",
            },
            costUsd: {
              value: null,
              unit: "USD",
              availability: "unavailable",
              source: "adapter",
            },
            tokens: {
              value: null,
              unit: "tokens",
              availability: "unavailable",
              source: "adapter",
            },
            footprintLines: {
              value: 2,
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
          limitations: ["host_isolation_unknown"],
        };
      },
    });
    expect(execution.status).toBe("completed");
    expect(execution.trials.map((trial) => trial.repetition)).toEqual([1, 2]);
  });
});
