import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  type RepeatedRunStatisticsV1,
  type RepeatedTrialObservationV1,
} from "@patchrace/contracts";

export interface CalculateRepeatedRunStatisticsOptions {
  readonly taskId: string;
  readonly variantId: string;
  readonly observations: readonly RepeatedTrialObservationV1[];
  readonly kValues?: readonly number[];
  readonly independence?: "declared-independent" | "unknown";
}

function statisticsError(
  code: string,
  message: string,
  path: string,
): PatchRaceError {
  return new PatchRaceError({
    code,
    category: "CONFIG",
    message,
    path,
    retryable: false,
  });
}

function validateObservations(
  options: CalculateRepeatedRunStatisticsOptions,
): readonly RepeatedTrialObservationV1[] {
  if (options.taskId.length === 0)
    throw statisticsError(
      "STATISTICS_TASK_ID_EMPTY",
      "Statistics require a task id.",
      "taskId",
    );
  if (options.variantId.length === 0)
    throw statisticsError(
      "STATISTICS_VARIANT_ID_EMPTY",
      "Statistics require a variant id.",
      "variantId",
    );
  if (options.observations.length === 0)
    throw statisticsError(
      "STATISTICS_OBSERVATIONS_EMPTY",
      "At least one trial observation is required.",
      "observations",
    );
  const seen = new Set<string>();
  for (const [index, observation] of options.observations.entries()) {
    if (observation.trialId.length === 0)
      throw statisticsError(
        "STATISTICS_TRIAL_ID_EMPTY",
        "Trial ids must not be empty.",
        `observations[${index}].trialId`,
      );
    if (seen.has(observation.trialId))
      throw statisticsError(
        "STATISTICS_TRIAL_ID_DUPLICATE",
        `Trial id '${observation.trialId}' is duplicated.`,
        `observations[${index}].trialId`,
      );
    seen.add(observation.trialId);
    if (!new Set(["passed", "failed", "not_graded"]).has(observation.outcome))
      throw statisticsError(
        "STATISTICS_OUTCOME_INVALID",
        "Trial outcome is not recognized.",
        `observations[${index}].outcome`,
      );
    if (
      !new Set(["valid", "compromised", "unknown"]).has(observation.integrity)
    )
      throw statisticsError(
        "STATISTICS_INTEGRITY_INVALID",
        "Trial integrity is not recognized.",
        `observations[${index}].integrity`,
      );
    if (observation.outcome === "passed" && observation.integrity !== "valid")
      throw statisticsError(
        "STATISTICS_INVALID_PASS",
        "A passed observation must have valid grader integrity.",
        `observations[${index}]`,
      );
    if (
      observation.failureCategory !== undefined &&
      observation.failureCategory.trim().length === 0
    )
      throw statisticsError(
        "STATISTICS_FAILURE_CATEGORY_EMPTY",
        "Failure categories must not be blank.",
        `observations[${index}].failureCategory`,
      );
    if (
      observation.outcome === "passed" &&
      observation.failureCategory !== undefined
    )
      throw statisticsError(
        "STATISTICS_PASS_CATEGORY_INVALID",
        "A passed observation cannot declare a failure category.",
        `observations[${index}].failureCategory`,
      );
  }
  return [...options.observations].sort((left, right) =>
    left.trialId.localeCompare(right.trialId),
  );
}

function defaultKValues(eligible: number): readonly number[] {
  if (eligible === 0) return [];
  return [...new Set([1, Math.min(3, eligible), Math.min(5, eligible)])].sort(
    (left, right) => left - right,
  );
}

function validateKValues(
  requested: readonly number[] | undefined,
  eligible: number,
): readonly number[] {
  const values = requested ?? defaultKValues(eligible);
  const unique = [...new Set(values)].sort((left, right) => left - right);
  if (unique.length !== values.length)
    throw statisticsError(
      "STATISTICS_K_DUPLICATE",
      "Each requested k value must be unique.",
      "kValues",
    );
  for (const [index, value] of values.entries()) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw statisticsError(
        "STATISTICS_K_INVALID",
        "Each k value must be a positive safe integer.",
        `kValues[${index}]`,
      );
    if (value > eligible)
      throw statisticsError(
        "STATISTICS_K_INFEASIBLE",
        `Requested k=${String(value)} exceeds the ${String(eligible)} eligible trials.`,
        `kValues[${index}]`,
      );
  }
  return unique;
}

function passAtK(samples: number, successes: number, k: number): number {
  const failures = samples - successes;
  if (failures < k) return 1;
  let allFailed = 1;
  for (let index = 0; index < k; index += 1)
    allFailed *= (failures - index) / (samples - index);
  return 1 - allFailed;
}

function wilson95(
  samples: number,
  successes: number,
): {
  readonly lower: number;
  readonly upper: number;
} {
  const z = 1.959963984540054;
  const p = successes / samples;
  const z2 = z * z;
  const denominator = 1 + z2 / samples;
  const center = (p + z2 / (2 * samples)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / samples + z2 / (4 * samples * samples));
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function failureCategory(observation: RepeatedTrialObservationV1): string {
  if (observation.failureCategory !== undefined)
    return observation.failureCategory;
  if (observation.integrity === "compromised") return "integrity:compromised";
  if (observation.integrity === "unknown") return "integrity:unknown";
  if (observation.outcome === "not_graded") return "outcome:not_graded";
  return "uncategorized";
}

export function calculateRepeatedRunStatistics(
  options: CalculateRepeatedRunStatisticsOptions,
): RepeatedRunStatisticsV1 {
  if (
    options.independence !== undefined &&
    options.independence !== "declared-independent" &&
    options.independence !== "unknown"
  )
    throw statisticsError(
      "STATISTICS_INDEPENDENCE_INVALID",
      "Independence must be declared-independent or unknown.",
      "independence",
    );
  const observations = validateObservations(options);
  const eligibleObservations = observations.filter(
    (observation) =>
      observation.integrity === "valid" &&
      (observation.outcome === "passed" || observation.outcome === "failed"),
  );
  const passed = eligibleObservations.filter(
    (observation) => observation.outcome === "passed",
  ).length;
  const failed = eligibleObservations.length - passed;
  const kValues = validateKValues(options.kValues, eligibleObservations.length);
  const successRate =
    eligibleObservations.length === 0
      ? null
      : passed / eligibleObservations.length;
  const sampleVariance =
    eligibleObservations.length <= 1 || successRate === null
      ? null
      : (successRate * (1 - successRate) * eligibleObservations.length) /
        (eligibleObservations.length - 1);
  const categories = new Map<string, number>();
  for (const observation of observations) {
    if (observation.outcome === "passed") continue;
    const category = failureCategory(observation);
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const failureCategories = Object.fromEntries(
    [...categories].sort(([left], [right]) => left.localeCompare(right)),
  );
  const excluded = observations.length - eligibleObservations.length;
  const independence = options.independence ?? "unknown";
  const caveats: RepeatedRunStatisticsV1["caveats"][number][] = [];
  if (eligibleObservations.length === 0)
    caveats.push({
      code: "no-eligible-trials",
      message:
        "No valid graded trials are available; rate and interval estimates are unavailable.",
    });
  else if (eligibleObservations.length < 30)
    caveats.push({
      code: "small-sample",
      message:
        "Fewer than 30 eligible trials produce wide, unstable estimates; report counts and the Wilson interval with every comparison.",
    });
  if (eligibleObservations.length === 1)
    caveats.push({
      code: "variance-unavailable",
      message: "Sample variance requires at least two eligible trials.",
    });
  if (independence === "unknown")
    caveats.push({
      code: "independence-not-established",
      message:
        "Trial independence was not established; pass^k is a plug-in scenario, not a confidence guarantee.",
    });
  if (excluded > 0)
    caveats.push({
      code: "excluded-trials",
      message:
        "Not-graded or non-valid-integrity trials are excluded from correctness estimates and reported separately.",
    });
  const sourceHash = canonicalHash(observations);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    group: { taskId: options.taskId, variantId: options.variantId },
    independence,
    counts: {
      total: observations.length,
      eligible: eligibleObservations.length,
      passed,
      failed,
      excluded,
      notGraded: observations.filter(
        (observation) => observation.outcome === "not_graded",
      ).length,
      compromised: observations.filter(
        (observation) => observation.integrity === "compromised",
      ).length,
      integrityUnknown: observations.filter(
        (observation) => observation.integrity === "unknown",
      ).length,
    },
    successRate,
    sampleVariance,
    standardError:
      sampleVariance === null
        ? null
        : Math.sqrt(sampleVariance / eligibleObservations.length),
    wilson95:
      eligibleObservations.length === 0
        ? null
        : wilson95(eligibleObservations.length, passed),
    passAtK: kValues.map((k) => ({
      k,
      value: passAtK(eligibleObservations.length, passed, k),
    })),
    passPowerK: kValues.map((k) => ({
      k,
      value: successRate === null ? 0 : successRate ** k,
    })),
    failureCategories,
    trialIds: observations.map((observation) => observation.trialId),
    sourceHash,
    caveats,
  } as const;
  return { ...payload, reportHash: canonicalHash(payload) };
}
