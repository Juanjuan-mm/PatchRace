import {
  PatchRaceError,
  SCHEMA_VERSION,
  type ComparisonMetricV1,
  type RaceExecutionV1,
  type RaceTrialResultV1,
  type RankedComparisonV1,
  type RankingObjective,
  type RankingPolicyV1,
  type VariantAggregateV1,
} from "@patchrace/contracts";

export const CORRECTNESS_FIRST_POLICY: RankingPolicyV1 = {
  schemaVersion: SCHEMA_VERSION,
  id: "correctness-first-v1",
  first: "hard-gates",
  afterHardGates: ["stability", "cost", "latency", "footprint"],
};

const objectives = new Set<RankingObjective>([
  "stability",
  "cost",
  "latency",
  "footprint",
]);

function validatePolicy(policy: RankingPolicyV1): void {
  if (policy.first !== "hard-gates")
    throw new PatchRaceError({
      code: "RANKING_HARD_GATES_NOT_FIRST",
      category: "CONFIG",
      message: "Comparison ranking must place deterministic hard gates first.",
      path: "policy.first",
    });
  if (new Set(policy.afterHardGates).size !== policy.afterHardGates.length)
    throw new PatchRaceError({
      code: "RANKING_OBJECTIVE_DUPLICATE",
      category: "CONFIG",
      message: "Ranking objectives must be unique.",
      path: "policy.afterHardGates",
    });
  if (policy.afterHardGates.some((objective) => !objectives.has(objective)))
    throw new PatchRaceError({
      code: "RANKING_OBJECTIVE_UNKNOWN",
      category: "CONFIG",
      message: "Ranking policy contains an unsupported objective.",
      path: "policy.afterHardGates",
    });
}

function unavailable(unit: string, source: string): ComparisonMetricV1 {
  return { value: null, unit, availability: "unavailable", source };
}

function mean(
  trials: readonly RaceTrialResultV1[],
  select: (trial: RaceTrialResultV1) => ComparisonMetricV1,
  unit: string,
  source: string,
): ComparisonMetricV1 {
  const values = trials.flatMap((trial) => {
    const metric = select(trial);
    return metric.availability === "unavailable" || metric.value === null
      ? []
      : [metric.value];
  });
  return values.length === 0
    ? unavailable(unit, source)
    : {
        value: values.reduce((sum, value) => sum + value, 0) / values.length,
        unit,
        availability: "derived",
        source,
      };
}

function aggregate(
  variantId: string,
  variantHash: `sha256:${string}`,
  trials: readonly RaceTrialResultV1[],
): VariantAggregateV1 {
  const completed = trials.filter(
    (trial) => trial.terminalStatus === "completed",
  );
  const valid = completed.filter((trial) => trial.integrity === "valid");
  const passed = valid.filter(
    (trial) =>
      trial.outcome === "passed" &&
      trial.hardGates.length > 0 &&
      trial.hardGates.every((gate) => gate.status === "passed"),
  );
  const failed = valid.filter((trial) => !passed.includes(trial));
  const passRate = valid.length === 0 ? null : passed.length / valid.length;
  const variance =
    passRate === null
      ? unavailable("ratio²", "ranking/stability-v1")
      : {
          value: passRate * (1 - passRate),
          unit: "ratio²",
          availability: "derived" as const,
          source: "ranking/stability-v1",
        };
  const caveats: string[] = [];
  if (valid.length !== trials.length) caveats.push("non_valid_trials_excluded");
  if (valid.length < 3) caveats.push("small_repeated_sample");
  const raw = {
    stabilityVariance: variance,
    meanCostUsd: mean(
      valid,
      (trial) => trial.metrics.costUsd,
      "USD",
      "ranking/mean-v1",
    ),
    meanLatencyMs: mean(
      valid,
      (trial) => trial.metrics.durationMs,
      "ms",
      "ranking/mean-v1",
    ),
    meanFootprintLines: mean(
      valid,
      (trial) => trial.metrics.footprintLines,
      "lines",
      "ranking/mean-v1",
    ),
  };
  for (const [name, metric] of Object.entries(raw))
    if (metric.availability === "unavailable")
      caveats.push(`${name}_unavailable`);
  return {
    variantId,
    variantHash,
    trialCount: trials.length,
    completedCount: completed.length,
    validCount: valid.length,
    passedCount: passed.length,
    failedCount: failed.length,
    hardGatePassRate: passRate,
    allHardGatesPassed:
      valid.length === trials.length && passed.length === trials.length,
    raw,
    caveats,
  };
}

function objectiveValue(
  value: VariantAggregateV1,
  objective: RankingObjective,
): number | null {
  if (objective === "stability") return value.raw.stabilityVariance.value;
  if (objective === "cost") return value.raw.meanCostUsd.value;
  if (objective === "latency") return value.raw.meanLatencyMs.value;
  return value.raw.meanFootprintLines.value;
}

function compare(
  left: VariantAggregateV1,
  right: VariantAggregateV1,
  policy: RankingPolicyV1,
): {
  readonly order: number;
  readonly dimension: RankedComparisonV1["variants"][number]["decisiveDimension"];
} {
  if (left.allHardGatesPassed !== right.allHardGatesPassed)
    return { order: left.allHardGatesPassed ? -1 : 1, dimension: "hard-gates" };
  if (left.hardGatePassRate !== right.hardGatePassRate) {
    if (left.hardGatePassRate === null)
      return { order: 1, dimension: "hard-gates" };
    if (right.hardGatePassRate === null)
      return { order: -1, dimension: "hard-gates" };
    return {
      order: right.hardGatePassRate - left.hardGatePassRate,
      dimension: "hard-gates",
    };
  }
  for (const objective of policy.afterHardGates) {
    const leftValue = objectiveValue(left, objective);
    const rightValue = objectiveValue(right, objective);
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue)
      return { order: leftValue - rightValue, dimension: objective };
  }
  return { order: 0, dimension: "tie" };
}

export function rankRace(
  execution: RaceExecutionV1,
  policy: RankingPolicyV1 = CORRECTNESS_FIRST_POLICY,
): RankedComparisonV1 {
  validatePolicy(policy);
  const aggregates = execution.plan.variants.map((variant) =>
    aggregate(
      variant.variantId,
      variant.variantHash,
      execution.trials.filter((trial) => trial.variantId === variant.variantId),
    ),
  );
  const sorted = [...aggregates].sort((left, right) => {
    const result = compare(left, right, policy).order;
    return result === 0
      ? left.variantId.localeCompare(right.variantId)
      : result;
  });
  let prior: VariantAggregateV1 | undefined;
  let rank = 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    policy,
    variants: sorted.map((value, index) => {
      const relation =
        prior === undefined
          ? { order: -1, dimension: "tie" as const }
          : compare(prior, value, policy);
      if (prior === undefined || relation.order !== 0) rank = index + 1;
      const decisiveDimension =
        prior === undefined ? "tie" : relation.dimension;
      prior = value;
      return {
        rank,
        variantId: value.variantId,
        variantHash: value.variantHash,
        aggregate: value,
        decisiveDimension,
      };
    }),
    caveats: [
      "ranking_is_specific_to_this_task_set_and_configuration",
      "missing_metrics_never_equal_zero",
      ...(aggregates.some((value) =>
        value.caveats.includes("small_repeated_sample"),
      )
        ? ["small_samples_limit_ranking_confidence"]
        : []),
    ],
  };
}
