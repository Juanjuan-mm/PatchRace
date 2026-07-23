import {
  PatchRaceError,
  canonicalHash,
  type FrozenDecisionPolicyV1,
  type ObjectiveDimension,
  type ObjectiveMetricV1,
  type ObjectiveVectorV1,
  type ParetoSelectionV1,
} from "@patchrace/contracts";

const dimensions: readonly ObjectiveDimension[] = [
  "successRate",
  "stabilityVariance",
  "costUsd",
  "latencyMs",
  "footprintLines",
  "contextTokens",
  "configComplexity",
];
const lowerIsBetter = new Set<ObjectiveDimension>(
  dimensions.filter((dimension) => dimension !== "successRate"),
);

function fail(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "CONFIG", message, path });
}

export function createObjectiveVector(
  value: Omit<
    ObjectiveVectorV1,
    "schemaVersion" | "objectiveSchemaVersion" | "vectorHash"
  >,
): ObjectiveVectorV1 {
  for (const dimension of dimensions) {
    const metric = value.metrics[dimension];
    if (
      (metric.availability === "unavailable" && metric.value !== null) ||
      (metric.availability !== "unavailable" &&
        (metric.value === null || !Number.isFinite(metric.value))) ||
      !Number.isInteger(metric.sampleCount) ||
      metric.sampleCount < 0 ||
      !Number.isInteger(metric.repetitions) ||
      metric.repetitions < 0 ||
      (metric.availability !== "unavailable" &&
        metric.sourceArtifactHashes.length === 0)
    )
      fail(
        "OBJECTIVE_METRIC_INVALID",
        `Objective metric '${dimension}' has inconsistent availability or provenance.`,
        `metrics.${dimension}`,
      );
  }
  const fixed = {
    schemaVersion: "1.0.0" as const,
    objectiveSchemaVersion: "1.0.0" as const,
    ...value,
  };
  return { ...fixed, vectorHash: canonicalHash(fixed) };
}

export function createDecisionPolicy(
  value: Omit<FrozenDecisionPolicyV1, "schemaVersion" | "policyHash">,
): FrozenDecisionPolicyV1 {
  const requiredDimensions = [...new Set(value.requiredDimensions)].sort();
  if (
    requiredDimensions.length === 0 ||
    !requiredDimensions.includes("successRate") ||
    !Number.isFinite(value.minimumSuccessRateImprovement) ||
    value.minimumSuccessRateImprovement < 0 ||
    Object.values(value.maximumRegression).some(
      (maximum) =>
        maximum === undefined || !Number.isFinite(maximum) || maximum < 0,
    )
  )
    fail(
      "DECISION_POLICY_INVALID",
      "Decision policy requires success and finite non-negative thresholds.",
      "policy",
    );
  const fixed = {
    schemaVersion: "1.0.0" as const,
    requiredDimensions,
    minimumSuccessRateImprovement: value.minimumSuccessRateImprovement,
    maximumRegression: value.maximumRegression,
    evidenceTier: value.evidenceTier,
  };
  return { ...fixed, policyHash: canonicalHash(fixed) };
}

function available(metric: ObjectiveMetricV1): metric is ObjectiveMetricV1 & {
  readonly value: number;
} {
  return metric.availability !== "unavailable" && metric.value !== null;
}

function hardGateRegression(vector: ObjectiveVectorV1): boolean {
  return Object.values(vector.hardGates).some((passed) => !passed);
}

function dominates(left: ObjectiveVectorV1, right: ObjectiveVectorV1): boolean {
  let strict = false;
  for (const dimension of dimensions) {
    const leftMetric = left.metrics[dimension];
    const rightMetric = right.metrics[dimension];
    if (
      !available(leftMetric) ||
      !available(rightMetric) ||
      leftMetric.unit !== rightMetric.unit
    )
      return false;
    if (lowerIsBetter.has(dimension)) {
      if (leftMetric.value > rightMetric.value) return false;
      if (leftMetric.value < rightMetric.value) strict = true;
    } else {
      if (leftMetric.value < rightMetric.value) return false;
      if (leftMetric.value > rightMetric.value) strict = true;
    }
  }
  return strict;
}

export function selectParetoCandidates(options: {
  readonly baseline: ObjectiveVectorV1;
  readonly candidates: readonly ObjectiveVectorV1[];
  readonly policy: FrozenDecisionPolicyV1;
}): ParetoSelectionV1 {
  if (
    options.baseline.phase !== "validation" ||
    options.candidates.some(
      (candidate) =>
        candidate.phase !== "validation" ||
        candidate.candidateId === options.baseline.candidateId,
    ) ||
    new Set(options.candidates.map((candidate) => candidate.candidateId))
      .size !== options.candidates.length
  )
    fail(
      "PARETO_INPUT_INVALID",
      "Pareto selection requires unique validation vectors and a separate baseline.",
      "candidates",
    );
  const preliminary = options.candidates.map((candidate) => {
    if (hardGateRegression(candidate))
      return {
        candidate,
        eligible: false,
        decision: "reject" as const,
        reasons: ["hard-gate-regression"],
        limitations: [] as string[],
      };
    const unavailable = options.policy.requiredDimensions.filter(
      (dimension) => !available(candidate.metrics[dimension]),
    );
    if (unavailable.length > 0)
      return {
        candidate,
        eligible: false,
        decision: "hold" as const,
        reasons: ["required-metric-unavailable"],
        limitations: unavailable.map((dimension) => `unavailable_${dimension}`),
      };
    const candidateSuccess = candidate.metrics.successRate;
    const baselineSuccess = options.baseline.metrics.successRate;
    if (
      !available(candidateSuccess) ||
      !available(baselineSuccess) ||
      candidateSuccess.unit !== baselineSuccess.unit
    )
      return {
        candidate,
        eligible: false,
        decision: "hold" as const,
        reasons: ["baseline-success-not-comparable"],
        limitations: ["success_rate_comparison_unavailable"],
      };
    if (
      candidateSuccess.value - baselineSuccess.value <
      options.policy.minimumSuccessRateImprovement
    )
      return {
        candidate,
        eligible: false,
        decision: "reject" as const,
        reasons: ["minimum-success-improvement-not-met"],
        limitations: [] as string[],
      };
    for (const [dimension, maximum] of Object.entries(
      options.policy.maximumRegression,
    ) as [Exclude<ObjectiveDimension, "successRate">, number][]) {
      const candidateMetric = candidate.metrics[dimension];
      const baselineMetric = options.baseline.metrics[dimension];
      if (
        !available(candidateMetric) ||
        !available(baselineMetric) ||
        candidateMetric.unit !== baselineMetric.unit
      )
        return {
          candidate,
          eligible: false,
          decision: "hold" as const,
          reasons: [`constraint-${dimension}-not-comparable`],
          limitations: [`unavailable_${dimension}`],
        };
      if (candidateMetric.value - baselineMetric.value > maximum)
        return {
          candidate,
          eligible: false,
          decision: "reject" as const,
          reasons: [`constraint-${dimension}-regression`],
          limitations: [] as string[],
        };
    }
    return {
      candidate,
      eligible: true,
      decision: "hold" as const,
      reasons: [] as string[],
      limitations: [] as string[],
    };
  });
  const eligible = preliminary
    .filter((item) => item.eligible)
    .map((item) => item.candidate);
  const dominatedBy = new Map<string, string[]>();
  for (const candidate of eligible)
    dominatedBy.set(
      candidate.candidateId,
      eligible
        .filter(
          (other) =>
            other.candidateId !== candidate.candidateId &&
            dominates(other, candidate),
        )
        .map((other) => other.candidateId)
        .sort(),
    );
  const frontier = eligible
    .filter((candidate) => dominatedBy.get(candidate.candidateId)!.length === 0)
    .map((candidate) => candidate.candidateId)
    .sort();
  return {
    schemaVersion: "1.0.0",
    policyHash: options.policy.policyHash,
    baselineVectorHash: options.baseline.vectorHash,
    frontier,
    decisions: preliminary
      .map((item) => {
        const dominators = dominatedBy.get(item.candidate.candidateId) ?? [];
        return {
          candidateId: item.candidate.candidateId,
          decision: item.eligible
            ? dominators.length === 0
              ? ("promote-eligible" as const)
              : ("hold" as const)
            : item.decision,
          dominatedBy: dominators,
          reasons: item.eligible
            ? dominators.length === 0
              ? ["pareto-frontier-under-frozen-policy"]
              : ["pareto-dominated-by-eligible-candidate"]
            : item.reasons,
          limitations: item.limitations,
        };
      })
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    rationale: [
      "correctness_and_safety_hard_gates_precede_objectives",
      "dimensions_remain_separate_without_hidden_aggregate_score",
      "pareto_dominance_requires_no_worse_value_in_every_dimension",
    ],
  };
}
