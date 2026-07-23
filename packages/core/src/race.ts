import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  createSortableId,
  type JsonValue,
  type RaceExecutionV1,
  type RacePlanV1,
  type RaceTaskSnapshotV1,
  type RaceTrialPlanV1,
  type RaceTrialResultV1,
  type RaceVariantV1,
  type TrialId,
} from "@patchrace/contracts";

import { BudgetTracker, type BudgetLimits } from "./budgets.js";
import { runScheduledJobs } from "./scheduler.js";

export interface RaceVariantInput {
  readonly variantId: string;
  readonly adapter: RaceVariantV1["adapter"];
  readonly model: string | null;
  readonly harness: Readonly<Record<string, JsonValue>>;
  readonly workflow: Readonly<Record<string, JsonValue>>;
  readonly environmentNames?: readonly string[];
}

export interface CreateRacePlanOptions {
  readonly tasks: readonly RaceTaskSnapshotV1[];
  readonly variants: readonly RaceVariantInput[];
  readonly repeat?: number;
  readonly maxTrials: number;
  readonly budgetIdentity?: Readonly<Record<string, JsonValue>>;
  readonly createTrialId?: () => TrialId;
}

const stableId = /^[a-z][a-z0-9-]{0,63}$/;

function configError(code: string, message: string, path: string): never {
  throw new PatchRaceError({
    code,
    category: "CONFIG",
    message,
    path,
    retryable: false,
  });
}

function uniqueIds(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length)
    configError("RACE_ID_DUPLICATE", `Duplicate identifier in ${path}.`, path);
  for (const value of values)
    if (!stableId.test(value))
      configError(
        "RACE_ID_INVALID",
        `Invalid stable identifier '${value}'.`,
        path,
      );
}

function normalizeVariant(input: RaceVariantInput): RaceVariantV1 {
  const environmentNames = [...new Set(input.environmentNames ?? [])].sort();
  const identity = {
    adapter: input.adapter,
    model: input.model,
    harness: input.harness,
    workflow: input.workflow,
    environmentNames,
  };
  return {
    variantId: input.variantId,
    variantHash: canonicalHash(identity),
    ...identity,
  };
}

export function createRacePlan(options: CreateRacePlanOptions): RacePlanV1 {
  if (options.tasks.length === 0)
    configError(
      "RACE_TASKS_EMPTY",
      "A race requires at least one task.",
      "tasks",
    );
  if (options.variants.length === 0)
    configError(
      "RACE_VARIANTS_EMPTY",
      "A race requires at least one variant.",
      "variants",
    );
  uniqueIds(
    options.tasks.map((task) => task.taskId),
    "tasks",
  );
  uniqueIds(
    options.variants.map((variant) => variant.variantId),
    "variants",
  );
  const repeat = options.repeat ?? 1;
  if (!Number.isInteger(repeat) || repeat < 1)
    configError(
      "RACE_REPEAT_INVALID",
      "Race repetition must be a positive integer.",
      "repeat",
    );
  if (!Number.isInteger(options.maxTrials) || options.maxTrials < 1)
    configError(
      "RACE_MAX_TRIALS_INVALID",
      "Race maxTrials must be a positive integer.",
      "maxTrials",
    );
  const count = options.tasks.length * options.variants.length * repeat;
  if (count > options.maxTrials)
    configError(
      "RACE_TRIAL_LIMIT_EXCEEDED",
      `Race plans ${count} trials but maxTrials is ${options.maxTrials}.`,
      "maxTrials",
    );

  const tasks = [...options.tasks].sort((left, right) =>
    left.taskId.localeCompare(right.taskId),
  );
  const variants = options.variants
    .map(normalizeVariant)
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
  const budgets = options.budgetIdentity ?? { maxTrials: options.maxTrials };
  const trialId =
    options.createTrialId ?? (() => createSortableId("trial") as TrialId);
  const trials: RaceTrialPlanV1[] = [];
  for (const task of tasks)
    for (const variant of variants)
      for (let repetition = 1; repetition <= repeat; repetition += 1)
        trials.push({
          trialId: trialId(),
          taskId: task.taskId,
          taskHash: task.taskHash,
          baselineCommit: task.baselineCommit,
          variantId: variant.variantId,
          variantHash: variant.variantHash,
          repetition,
          attempt: 1,
          supersedesTrialId: null,
        });
  if (new Set(trials.map((trial) => trial.trialId)).size !== trials.length)
    configError(
      "RACE_TRIAL_ID_DUPLICATE",
      "Trial ID allocation produced a duplicate.",
      "trials",
    );
  const comparable = {
    comparisonDimensions: ["model", "harness", "workflow"] as const,
    tasks,
    variants,
    repeat,
    budgets,
    trials: trials.map(({ trialId: _trialId, ...trial }) => trial),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    planHash: canonicalHash(comparable),
    ...comparable,
    trials,
  };
}

export async function executeRacePlan(options: {
  readonly plan: RacePlanV1;
  readonly concurrency: number;
  readonly budgets: BudgetLimits;
  readonly signal?: AbortSignal;
  readonly executeTrial: (
    trial: RaceTrialPlanV1,
    context: {
      readonly signal: AbortSignal;
      reportUsage(usage: {
        readonly tokens?: number | null;
        readonly costUsd?: number | null;
        readonly diskBytes?: number;
      }): void;
    },
  ) => Promise<RaceTrialResultV1>;
}): Promise<RaceExecutionV1> {
  const budgets = new BudgetTracker(options.budgets);
  const scheduled = await runScheduledJobs(
    options.plan.trials.map((trial) => ({
      id: trial.trialId,
      run: (context) => options.executeTrial(trial, context),
    })),
    {
      concurrency: options.concurrency,
      budgets,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
  const trials = scheduled.flatMap((result) =>
    result.status === "completed" && result.value !== undefined
      ? [result.value]
      : [],
  );
  const statuses = new Set(scheduled.map((result) => result.status));
  const status: RaceExecutionV1["status"] = statuses.has("budget_exhausted")
    ? "budget_exhausted"
    : statuses.has("cancelled")
      ? "cancelled"
      : statuses.has("failed") || statuses.has("skipped")
        ? "partial"
        : "completed";
  return {
    schemaVersion: SCHEMA_VERSION,
    plan: options.plan,
    status,
    trials,
    scheduler: scheduled.map((result) => ({
      trialId: result.id as TrialId,
      status: result.status,
      errorCode: result.error?.code ?? null,
    })),
  };
}
