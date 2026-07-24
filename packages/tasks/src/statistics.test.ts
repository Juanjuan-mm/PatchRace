import { describe, expect, it } from "vitest";

import type { RepeatedTrialObservationV1 } from "@patchrace/contracts";

import { calculateRepeatedRunStatistics } from "./statistics.js";

function observation(
  trialId: string,
  outcome: RepeatedTrialObservationV1["outcome"],
  failureCategory?: string,
): RepeatedTrialObservationV1 {
  return {
    trialId,
    outcome,
    integrity: "valid",
    ...(failureCategory === undefined ? {} : { failureCategory }),
  };
}

describe("calculateRepeatedRunStatistics", () => {
  it("reports known mixed-sample rates, estimators, variance, and categories", () => {
    const report = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "pi-default",
      independence: "declared-independent",
      kValues: [1, 2, 3],
      observations: [
        observation("trial-5", "failed", "tests"),
        observation("trial-2", "passed"),
        observation("trial-4", "failed", "lint"),
        observation("trial-1", "passed"),
        observation("trial-3", "failed", "tests"),
      ],
    });

    expect(report).toMatchObject({
      counts: {
        total: 5,
        eligible: 5,
        passed: 2,
        failed: 3,
        excluded: 0,
      },
      successRate: 0.4,
      sampleVariance: 0.3,
      passAtK: [
        { k: 1, value: 0.4 },
        { k: 2, value: 0.7 },
        { k: 3, value: 0.9 },
      ],
      passPowerK: [
        { k: 1, value: 0.4 },
        { k: 2, value: 0.16000000000000003 },
        { k: 3, value: 0.06400000000000002 },
      ],
      failureCategories: { lint: 1, tests: 2 },
      trialIds: ["trial-1", "trial-2", "trial-3", "trial-4", "trial-5"],
    });
    expect(report.standardError).toBeCloseTo(Math.sqrt(0.06));
    expect(report.wilson95).toEqual({
      lower: expect.closeTo(0.11762077423264794),
      upper: expect.closeTo(0.769275718723987),
    });
    expect(report.caveats.map((caveat) => caveat.code)).toEqual([
      "small-sample",
    ]);
    expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("handles zero and all-success samples without unstable combinatorics", () => {
    const none = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "none",
      kValues: [1, 3],
      observations: [
        observation("1", "failed"),
        observation("2", "failed"),
        observation("3", "failed"),
      ],
    });
    expect(none.successRate).toBe(0);
    expect(none.passAtK).toEqual([
      { k: 1, value: 0 },
      { k: 3, value: 0 },
    ]);
    expect(none.passPowerK).toEqual([
      { k: 1, value: 0 },
      { k: 3, value: 0 },
    ]);
    expect(none.failureCategories).toEqual({ uncategorized: 3 });

    const all = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "all",
      kValues: [1, 4],
      observations: [1, 2, 3, 4].map((value) =>
        observation(String(value), "passed"),
      ),
    });
    expect(all.successRate).toBe(1);
    expect(all.sampleVariance).toBe(0);
    expect(all.standardError).toBe(0);
    expect(all.passAtK).toEqual([
      { k: 1, value: 1 },
      { k: 4, value: 1 },
    ]);
    expect(all.passPowerK).toEqual([
      { k: 1, value: 1 },
      { k: 4, value: 1 },
    ]);
  });

  it("separates unavailable and compromised trials from correctness estimates", () => {
    const report = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "partial",
      observations: [
        observation("good", "passed"),
        {
          trialId: "grader",
          outcome: "not_graded",
          integrity: "compromised",
        },
        {
          trialId: "unknown",
          outcome: "not_graded",
          integrity: "unknown",
          failureCategory: "environment",
        },
      ],
    });

    expect(report.counts).toEqual({
      total: 3,
      eligible: 1,
      passed: 1,
      failed: 0,
      excluded: 2,
      notGraded: 2,
      compromised: 1,
      integrityUnknown: 1,
    });
    expect(report.successRate).toBe(1);
    expect(report.sampleVariance).toBeNull();
    expect(report.failureCategories).toEqual({
      environment: 1,
      "integrity:compromised": 1,
    });
    expect(report.caveats.map((caveat) => caveat.code)).toEqual([
      "small-sample",
      "variance-unavailable",
      "independence-not-established",
      "excluded-trials",
    ]);

    const unavailable = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "unavailable",
      observations: [
        {
          trialId: "only",
          outcome: "not_graded",
          integrity: "unknown",
        },
      ],
    });
    expect(unavailable).toMatchObject({
      successRate: null,
      sampleVariance: null,
      standardError: null,
      wilson95: null,
      passAtK: [],
      passPowerK: [],
    });
    expect(unavailable.caveats.map((caveat) => caveat.code)).toContain(
      "no-eligible-trials",
    );
  });

  it("is input-order independent and rejects invalid samples or k values", () => {
    const values = [
      observation("b", "failed", "tests"),
      observation("a", "passed"),
    ];
    const left = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "stable",
      observations: values,
      kValues: [2, 1],
    });
    const right = calculateRepeatedRunStatistics({
      taskId: "task-a",
      variantId: "stable",
      observations: [...values].reverse(),
      kValues: [1, 2],
    });
    expect(left).toEqual(right);

    expect(() =>
      calculateRepeatedRunStatistics({
        taskId: "task-a",
        variantId: "duplicate",
        observations: [
          observation("same", "passed"),
          observation("same", "failed"),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          code: "STATISTICS_TRIAL_ID_DUPLICATE",
        }),
      }),
    );
    expect(() =>
      calculateRepeatedRunStatistics({
        taskId: "task-a",
        variantId: "bad-integrity",
        observations: [
          { trialId: "one", outcome: "passed", integrity: "unknown" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ code: "STATISTICS_INVALID_PASS" }),
      }),
    );
    expect(() =>
      calculateRepeatedRunStatistics({
        taskId: "task-a",
        variantId: "bad-k",
        observations: [observation("one", "passed")],
        kValues: [2],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ code: "STATISTICS_K_INFEASIBLE" }),
      }),
    );
  });
});
