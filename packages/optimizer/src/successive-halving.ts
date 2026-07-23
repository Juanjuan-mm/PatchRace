import {
  PatchRaceError,
  canonicalHash,
  type HalvingRoundDecisionV1,
  type SuccessiveHalvingPlanV1,
} from "@patchrace/contracts";

export interface HalvingRoundOutcome {
  readonly candidateId: string;
  readonly completedTrials: number;
  readonly hardGateRegression: boolean;
  readonly successRate: number;
  readonly wallTimeMs: number;
  readonly tokens: number | null;
  readonly costUsd: number | null;
}

function fail(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "BUDGET", message, path });
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function createSuccessiveHalvingPlan(options: {
  readonly candidateIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly reductionFactor?: number;
  readonly maxRepetitions?: number;
  readonly budgets: SuccessiveHalvingPlanV1["budgets"];
  readonly perTrial: SuccessiveHalvingPlanV1["perTrial"];
}): SuccessiveHalvingPlanV1 {
  const candidateIds = [...options.candidateIds].sort();
  const taskIds = [...options.taskIds].sort();
  const reductionFactor = options.reductionFactor ?? 2;
  const maxRepetitions = options.maxRepetitions ?? 4;
  if (
    candidateIds.length === 0 ||
    new Set(candidateIds).size !== candidateIds.length ||
    taskIds.length === 0 ||
    new Set(taskIds).size !== taskIds.length ||
    !positiveInteger(reductionFactor) ||
    reductionFactor < 2 ||
    !positiveInteger(maxRepetitions) ||
    !positiveInteger(options.budgets.maxCandidates) ||
    !positiveInteger(options.budgets.maxTrials) ||
    !positiveInteger(options.budgets.maxWallTimeMs) ||
    !positiveInteger(options.perTrial.maxWallTimeMs) ||
    candidateIds.length > options.budgets.maxCandidates
  )
    fail(
      "HALVING_PLAN_INVALID",
      "Successive-halving inputs and budgets must be unique, positive, and bounded.",
      "plan",
    );
  for (const value of [
    options.budgets.maxTokens,
    options.budgets.maxCostUsd,
    options.perTrial.maxTokens,
    options.perTrial.maxCostUsd,
  ])
    if (value !== null && (!Number.isFinite(value) || value < 0))
      fail(
        "HALVING_BUDGET_INVALID",
        "Token and cost budgets must be non-negative or unavailable.",
        "budgets",
      );
  if (
    (options.budgets.maxTokens !== null &&
      options.perTrial.maxTokens === null) ||
    (options.budgets.maxCostUsd !== null &&
      options.perTrial.maxCostUsd === null)
  )
    fail(
      "HALVING_BUDGET_UNENFORCEABLE",
      "A finite aggregate budget requires a finite per-trial bound.",
      "perTrial",
    );
  const rounds: SuccessiveHalvingPlanV1["rounds"][number][] = [];
  let candidateLimit = candidateIds.length;
  let taskCount = 1;
  let repetitions = 1;
  let projectedTrials = 0;
  while (true) {
    const trialsPerCandidate = taskCount * repetitions;
    const roundTrials = candidateLimit * trialsPerCandidate;
    if (
      projectedTrials + roundTrials > options.budgets.maxTrials ||
      (projectedTrials + roundTrials) * options.perTrial.maxWallTimeMs >
        options.budgets.maxWallTimeMs ||
      (options.budgets.maxTokens !== null &&
        (projectedTrials + roundTrials) * options.perTrial.maxTokens! >
          options.budgets.maxTokens) ||
      (options.budgets.maxCostUsd !== null &&
        (projectedTrials + roundTrials) * options.perTrial.maxCostUsd! >
          options.budgets.maxCostUsd)
    )
      break;
    rounds.push({
      round: rounds.length + 1,
      candidateLimit,
      taskIds: taskIds.slice(0, taskCount),
      repetitions,
      trialsPerCandidate,
    });
    projectedTrials += roundTrials;
    if (
      candidateLimit === 1 &&
      taskCount === taskIds.length &&
      repetitions === maxRepetitions
    )
      break;
    candidateLimit = Math.max(1, Math.ceil(candidateLimit / reductionFactor));
    taskCount = Math.min(taskIds.length, taskCount * reductionFactor);
    repetitions = Math.min(maxRepetitions, repetitions * reductionFactor);
  }
  if (rounds.length === 0)
    fail(
      "HALVING_BUDGET_TOO_SMALL",
      "Budgets cannot fund even the first screening round.",
      "budgets",
    );
  const fixed = {
    schemaVersion: "1.0.0" as const,
    halvingPlanSchemaVersion: "1.0.0" as const,
    candidateIds,
    reductionFactor,
    budgets: options.budgets,
    perTrial: options.perTrial,
    rounds,
  };
  return { ...fixed, planHash: canonicalHash(fixed) };
}

export function decideHalvingRound(options: {
  readonly plan: SuccessiveHalvingPlanV1;
  readonly round: number;
  readonly activeCandidateIds: readonly string[];
  readonly outcomes: readonly HalvingRoundOutcome[];
}): HalvingRoundDecisionV1 {
  const round = options.plan.rounds.find(
    (candidate) => candidate.round === options.round,
  );
  if (round === undefined)
    fail("HALVING_ROUND_UNKNOWN", "Halving round does not exist.", "round");
  const active = [...options.activeCandidateIds].sort();
  if (
    active.length === 0 ||
    active.length > round.candidateLimit ||
    new Set(active).size !== active.length ||
    options.outcomes.length !== active.length ||
    new Set(options.outcomes.map((outcome) => outcome.candidateId)).size !==
      options.outcomes.length ||
    options.outcomes.some(
      (outcome) =>
        !active.includes(outcome.candidateId) ||
        outcome.completedTrials !== round.trialsPerCandidate ||
        !Number.isFinite(outcome.successRate) ||
        outcome.successRate < 0 ||
        outcome.successRate > 1 ||
        outcome.wallTimeMs < 0,
    )
  )
    fail(
      "HALVING_OUTCOMES_INVALID",
      "Round outcomes must exactly cover active candidates and allocation.",
      "outcomes",
    );
  const consumed = {
    trials: options.outcomes.reduce(
      (sum, outcome) => sum + outcome.completedTrials,
      0,
    ),
    wallTimeMs: options.outcomes.reduce(
      (sum, outcome) => sum + outcome.wallTimeMs,
      0,
    ),
    tokens: options.outcomes.some((outcome) => outcome.tokens === null)
      ? null
      : options.outcomes.reduce((sum, outcome) => sum + outcome.tokens!, 0),
    costUsd: options.outcomes.some((outcome) => outcome.costUsd === null)
      ? null
      : options.outcomes.reduce((sum, outcome) => sum + outcome.costUsd!, 0),
  };
  if (
    consumed.trials > options.plan.budgets.maxTrials ||
    consumed.wallTimeMs > options.plan.budgets.maxWallTimeMs ||
    (options.plan.budgets.maxTokens !== null &&
      (consumed.tokens === null ||
        consumed.tokens > options.plan.budgets.maxTokens)) ||
    (options.plan.budgets.maxCostUsd !== null &&
      (consumed.costUsd === null ||
        consumed.costUsd > options.plan.budgets.maxCostUsd))
  )
    fail(
      "HALVING_BUDGET_EXCEEDED",
      "Observed round use exceeds a hard search budget.",
      "outcomes",
    );
  const rejected = options.outcomes
    .filter((outcome) => outcome.hardGateRegression)
    .map((outcome) => ({
      candidateId: outcome.candidateId,
      reason: "hard-gate-regression",
    }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const eligible = options.outcomes
    .filter((outcome) => !outcome.hardGateRegression)
    .sort(
      (left, right) =>
        right.successRate - left.successRate ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const nextRound = options.plan.rounds.find(
    (candidate) => candidate.round === options.round + 1,
  );
  const survivorCount =
    nextRound === undefined
      ? eligible.length
      : Math.min(nextRound.candidateLimit, eligible.length);
  const survivors = eligible
    .slice(0, survivorCount)
    .map((outcome) => outcome.candidateId)
    .sort();
  const earlyStopped = eligible
    .slice(survivorCount)
    .map((outcome) => ({
      candidateId: outcome.candidateId,
      reason: "lower-correctness-screen-at-this-round",
      fullyEvaluated: false as const,
    }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  return {
    schemaVersion: "1.0.0",
    planHash: options.plan.planHash,
    round: options.round,
    survivors,
    earlyStopped,
    rejected,
    consumed,
    rationale: [
      "hard_gate_regressions_rejected_before_ranking",
      "survivors_selected_by_declared_success_rate_screen_only",
      "early_stopped_candidates_are_not_fully_evaluated",
    ],
  };
}
