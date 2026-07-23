import {
  PatchRaceError,
  SCHEMA_VERSION,
  type ComparisonBaselineV1,
  type RegressionComparisonV1,
  type VariantAggregateV1,
} from "@patchrace/contracts";

function delta(
  candidate: number | null,
  baseline: number | null,
): number | null {
  return candidate === null || baseline === null ? null : candidate - baseline;
}

export function createComparisonBaseline(options: {
  readonly name: string;
  readonly acceptedAt: string;
  readonly sourcePlanHash: `sha256:${string}`;
  readonly taskHashes: readonly `sha256:${string}`[];
  readonly policyId: string;
  readonly aggregate: VariantAggregateV1;
}): ComparisonBaselineV1 {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(options.name))
    throw new PatchRaceError({
      code: "BASELINE_NAME_INVALID",
      category: "CONFIG",
      message: "Baseline name must be a stable lowercase identifier.",
      path: "name",
    });
  if (
    options.taskHashes.length === 0 ||
    new Set(options.taskHashes).size !== options.taskHashes.length
  )
    throw new PatchRaceError({
      code: "BASELINE_TASKS_INVALID",
      category: "CONFIG",
      message: "Baseline task hashes must be non-empty and unique.",
      path: "taskHashes",
    });
  if (!Number.isFinite(Date.parse(options.acceptedAt)))
    throw new PatchRaceError({
      code: "BASELINE_DATE_INVALID",
      category: "CONFIG",
      message: "Baseline acceptance time must be ISO-compatible.",
      path: "acceptedAt",
    });
  return {
    schemaVersion: SCHEMA_VERSION,
    baselineSchemaVersion: "1.0.0",
    ...options,
    taskHashes: [...options.taskHashes].sort(),
  };
}

export function compareRegression(options: {
  readonly baseline: ComparisonBaselineV1;
  readonly candidate: VariantAggregateV1;
  readonly taskHashes: readonly `sha256:${string}`[];
  readonly policyId: string;
}): RegressionComparisonV1 {
  const taskMatch =
    JSON.stringify([...options.taskHashes].sort()) ===
    JSON.stringify(options.baseline.taskHashes);
  const policyMatch = options.policyId === options.baseline.policyId;
  if (!taskMatch || !policyMatch)
    return {
      schemaVersion: SCHEMA_VERSION,
      baselineName: options.baseline.name,
      baselineVariantId: options.baseline.aggregate.variantId,
      candidateVariantId: options.candidate.variantId,
      comparable: false,
      deltas: {
        hardGatePassRate: null,
        stabilityVariance: null,
        meanCostUsd: null,
        meanLatencyMs: null,
        meanFootprintLines: null,
      },
      decision: "hold",
      reasons: [
        taskMatch ? "comparison_policy_mismatch" : "task_commitment_mismatch",
      ],
      unavailableInputs: [],
    };
  const baseline = options.baseline.aggregate;
  const deltas = {
    hardGatePassRate: delta(
      options.candidate.hardGatePassRate,
      baseline.hardGatePassRate,
    ),
    stabilityVariance: delta(
      options.candidate.raw.stabilityVariance.value,
      baseline.raw.stabilityVariance.value,
    ),
    meanCostUsd: delta(
      options.candidate.raw.meanCostUsd.value,
      baseline.raw.meanCostUsd.value,
    ),
    meanLatencyMs: delta(
      options.candidate.raw.meanLatencyMs.value,
      baseline.raw.meanLatencyMs.value,
    ),
    meanFootprintLines: delta(
      options.candidate.raw.meanFootprintLines.value,
      baseline.raw.meanFootprintLines.value,
    ),
  };
  const unavailableInputs = Object.entries(deltas)
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  const reasons: string[] = [];
  let decision: RegressionComparisonV1["decision"] = "promote";
  if (
    !options.candidate.allHardGatesPassed ||
    (deltas.hardGatePassRate ?? 0) < 0
  ) {
    decision = "reject";
    reasons.push("deterministic_correctness_regression");
  } else if (unavailableInputs.length > 0 || options.candidate.validCount < 3) {
    decision = "hold";
    reasons.push("insufficient_complete_evidence");
  } else if (
    (deltas.stabilityVariance ?? 0) > 0 ||
    (deltas.meanCostUsd ?? 0) > 0 ||
    (deltas.meanLatencyMs ?? 0) > 0 ||
    (deltas.meanFootprintLines ?? 0) > 0
  ) {
    decision = "hold";
    reasons.push("secondary_dimension_regression");
  } else reasons.push("no_recorded_regression");
  return {
    schemaVersion: SCHEMA_VERSION,
    baselineName: options.baseline.name,
    baselineVariantId: baseline.variantId,
    candidateVariantId: options.candidate.variantId,
    comparable: true,
    deltas,
    decision,
    reasons,
    unavailableInputs,
  };
}
