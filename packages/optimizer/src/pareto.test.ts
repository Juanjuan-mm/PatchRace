import { describe, expect, it } from "vitest";

import {
  sha256,
  type ObjectiveDimension,
  type ObjectiveMetricV1,
} from "@patchrace/contracts";

import {
  createDecisionPolicy,
  createObjectiveVector,
  selectParetoCandidates,
} from "./pareto.js";

const units: Record<ObjectiveDimension, string> = {
  successRate: "ratio",
  stabilityVariance: "ratio2",
  costUsd: "usd",
  latencyMs: "ms",
  footprintLines: "lines",
  contextTokens: "estimated-tokens",
  configComplexity: "points",
};

function metric(
  dimension: ObjectiveDimension,
  value: number | null,
): ObjectiveMetricV1 {
  return {
    availability: value === null ? "unavailable" : "observed",
    value,
    unit: units[dimension],
    sampleCount: value === null ? 0 : 4,
    taskIds: value === null ? [] : ["task-a", "task-b"],
    repetitions: value === null ? 0 : 2,
    variance: null,
    interval: null,
    sourceArtifactHashes:
      value === null ? [] : [sha256(`${dimension}-${value}`)],
  };
}

function vector(
  candidateId: string,
  values: Partial<Record<ObjectiveDimension, number | null>>,
  hardGate = true,
) {
  const value = (dimension: ObjectiveDimension, fallback: number) =>
    Object.hasOwn(values, dimension) ? values[dimension]! : fallback;
  return createObjectiveVector({
    candidateId,
    phase: "validation",
    hardGates: {
      integrity: hardGate,
      correctness: hardGate,
      safety: hardGate,
      protectedPaths: hardGate,
    },
    metrics: {
      successRate: metric("successRate", value("successRate", 0.5)),
      stabilityVariance: metric(
        "stabilityVariance",
        value("stabilityVariance", 0.1),
      ),
      costUsd: metric("costUsd", value("costUsd", 1)),
      latencyMs: metric("latencyMs", value("latencyMs", 100)),
      footprintLines: metric("footprintLines", value("footprintLines", 10)),
      contextTokens: metric("contextTokens", value("contextTokens", 100)),
      configComplexity: metric(
        "configComplexity",
        value("configComplexity", 5),
      ),
    },
  });
}

const policy = createDecisionPolicy({
  requiredDimensions: [
    "successRate",
    "stabilityVariance",
    "latencyMs",
    "footprintLines",
    "contextTokens",
    "configComplexity",
  ],
  minimumSuccessRateImprovement: 0.1,
  maximumRegression: {
    latencyMs: 20,
    footprintLines: 5,
    contextTokens: 50,
    configComplexity: 5,
  },
  evidenceTier: "validation",
});

describe("Pareto candidate selection", () => {
  it("keeps objective dimensions separate and explains the frontier", () => {
    const baseline = vector("baseline", { successRate: 0.5 });
    const fast = vector("cand-fast", {
      successRate: 0.8,
      latencyMs: 70,
      costUsd: 1,
    });
    const cheap = vector("cand-cheap", {
      successRate: 0.8,
      latencyMs: 90,
      costUsd: 0.5,
    });
    const dominated = vector("cand-dominated", {
      successRate: 0.7,
      latencyMs: 100,
      costUsd: 1,
    });

    const result = selectParetoCandidates({
      baseline,
      candidates: [dominated, cheap, fast],
      policy,
    });

    expect(result.frontier).toEqual(["cand-cheap", "cand-fast"]);
    expect(
      result.decisions.find(
        (decision) => decision.candidateId === "cand-dominated",
      ),
    ).toMatchObject({
      decision: "hold",
      dominatedBy: ["cand-cheap", "cand-fast"],
      reasons: ["pareto-dominated-by-eligible-candidate"],
    });
    expect(result.rationale).toContain(
      "dimensions_remain_separate_without_hidden_aggregate_score",
    );
  });

  it("rejects hard gates and correctness/constraint regressions before Pareto", () => {
    const baseline = vector("baseline", { successRate: 0.5 });
    const result = selectParetoCandidates({
      baseline,
      candidates: [
        vector("cand-unsafe", { successRate: 1 }, false),
        vector("cand-no-improvement", { successRate: 0.55 }),
        vector("cand-too-complex", {
          successRate: 0.8,
          configComplexity: 20,
        }),
      ],
      policy,
    });

    expect(result.frontier).toEqual([]);
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "cand-unsafe",
          decision: "reject",
          reasons: ["hard-gate-regression"],
        }),
        expect.objectContaining({
          candidateId: "cand-no-improvement",
          decision: "reject",
        }),
        expect.objectContaining({
          candidateId: "cand-too-complex",
          decision: "reject",
          reasons: ["constraint-configComplexity-regression"],
        }),
      ]),
    );
  });

  it("holds when a required metric is unavailable", () => {
    const baseline = vector("baseline", { successRate: 0.5 });
    const candidate = vector("cand-unknown", {
      successRate: 0.8,
      latencyMs: null,
    });
    const result = selectParetoCandidates({
      baseline,
      candidates: [candidate],
      policy,
    });

    expect(result.frontier).toEqual([]);
    expect(result.decisions[0]).toMatchObject({
      decision: "hold",
      reasons: ["required-metric-unavailable"],
      limitations: ["unavailable_latencyMs"],
    });
  });
});
