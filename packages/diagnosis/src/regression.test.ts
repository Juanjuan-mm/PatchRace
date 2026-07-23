import { describe, expect, it } from "vitest";
import type { VariantAggregateV1 } from "@patchrace/contracts";
import { compareRegression, createComparisonBaseline } from "./regression.js";

const hash = `sha256:${"a".repeat(64)}` as const;
function aggregate(id: string, rate = 1, available = true): VariantAggregateV1 {
  const metric = (value: number) => ({
    value: available ? value : null,
    unit: "unit",
    availability: available ? ("derived" as const) : ("unavailable" as const),
    source: "test",
  });
  return {
    variantId: id,
    variantHash: hash,
    trialCount: 3,
    completedCount: 3,
    validCount: 3,
    passedCount: rate * 3,
    failedCount: 3 - rate * 3,
    hardGatePassRate: rate,
    allHardGatesPassed: rate === 1,
    raw: {
      stabilityVariance: metric(0),
      meanCostUsd: metric(1),
      meanLatencyMs: metric(10),
      meanFootprintLines: metric(2),
    },
    caveats: [],
  };
}
describe("baseline regression", () => {
  const baseline = createComparisonBaseline({
    name: "main",
    acceptedAt: "2026-07-23T00:00:00.000Z",
    sourcePlanHash: hash,
    taskHashes: [hash],
    policyId: "correctness-first-v1",
    aggregate: aggregate("base"),
  });
  it("rejects correctness regression before secondary gains", () => {
    const result = compareRegression({
      baseline,
      candidate: aggregate("candidate", 2 / 3),
      taskHashes: [hash],
      policyId: "correctness-first-v1",
    });
    expect(result.decision).toBe("reject");
  });
  it("holds incomplete or incomparable evidence", () => {
    expect(
      compareRegression({
        baseline,
        candidate: aggregate("candidate", 1, false),
        taskHashes: [hash],
        policyId: "correctness-first-v1",
      }).decision,
    ).toBe("hold");
    expect(
      compareRegression({
        baseline,
        candidate: aggregate("candidate"),
        taskHashes: [`sha256:${"b".repeat(64)}`],
        policyId: "correctness-first-v1",
      }).comparable,
    ).toBe(false);
  });
  it("promotes only complete non-regressing inputs", () => {
    expect(
      compareRegression({
        baseline,
        candidate: aggregate("candidate"),
        taskHashes: [hash],
        policyId: "correctness-first-v1",
      }).decision,
    ).toBe("promote");
  });
});
