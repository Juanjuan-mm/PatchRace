import {
  PatchRaceError,
  canonicalHash,
  type AblationExecutionV1,
  type CandidateSnapshotV1,
  type ContentHash,
  type FrozenAblationPlanV1,
} from "@patchrace/contracts";

export interface AblationResourceSnapshot {
  readonly files: readonly {
    readonly logicalPath: string;
    readonly hash: ContentHash;
  }[];
}

export interface CreateAblationPlanOptions {
  readonly candidate: CandidateSnapshotV1;
  readonly phase: FrozenAblationPlanV1["phase"];
  readonly taskSnapshots: FrozenAblationPlanV1["taskSnapshots"];
  readonly invariant: FrozenAblationPlanV1["invariant"];
  readonly baseline: FrozenAblationPlanV1["baseline"];
  readonly candidateResourceHash: ContentHash;
  readonly repetitionCount: number;
}

export type AblationEvaluator = (
  trial: FrozenAblationPlanV1["trials"][number],
  signal: AbortSignal,
) => Promise<AblationExecutionV1["outcomes"][number]>;

function fail(
  code: string,
  category: "CONFIG" | "CONFLICT" | "SAFETY",
  message: string,
  path: string,
): never {
  throw new PatchRaceError({ code, category, message, path });
}

export function createAblationPlan(
  options: CreateAblationPlanOptions,
): FrozenAblationPlanV1 {
  if (options.candidate.decision.state !== "approved")
    fail(
      "ABLATION_CANDIDATE_NOT_APPROVED",
      "CONFLICT",
      "Candidate must pass explicit review before ablation.",
      "candidate.decision",
    );
  if (
    options.taskSnapshots.length === 0 ||
    new Set(options.taskSnapshots.map((task) => task.taskId)).size !==
      options.taskSnapshots.length
  )
    fail(
      "ABLATION_TASKS_INVALID",
      "CONFIG",
      "Ablation requires unique frozen task snapshots.",
      "taskSnapshots",
    );
  if (
    !Number.isInteger(options.repetitionCount) ||
    options.repetitionCount < 1 ||
    options.repetitionCount > 100
  )
    fail(
      "ABLATION_REPETITIONS_INVALID",
      "CONFIG",
      "Ablation repetition count must be between one and one hundred.",
      "repetitionCount",
    );
  if (options.baseline.resourceHash === options.candidateResourceHash)
    fail(
      "ABLATION_RESOURCE_HASH_UNCHANGED",
      "CONFLICT",
      "Candidate resource identity must differ from baseline.",
      "candidateResourceHash",
    );
  const environmentNames = [...options.invariant.environmentNames].sort();
  if (
    new Set(environmentNames).size !== environmentNames.length ||
    environmentNames.some((name) => !/^[A-Z][A-Z0-9_]{0,127}$/u.test(name))
  )
    fail(
      "ABLATION_ENVIRONMENT_NAMES_INVALID",
      "CONFIG",
      "Ablation environment names must be unique safe names without values.",
      "invariant.environmentNames",
    );
  const tasks = [...options.taskSnapshots].sort((left, right) =>
    left.taskId.localeCompare(right.taskId),
  );
  let order = 0;
  const trials: FrozenAblationPlanV1["trials"][number][] = [];
  for (
    let repetition = 1;
    repetition <= options.repetitionCount;
    repetition += 1
  )
    for (const task of tasks) {
      const arms =
        repetition % 2 === 1
          ? (["baseline", "candidate"] as const)
          : (["candidate", "baseline"] as const);
      for (const arm of arms) {
        order += 1;
        trials.push({
          trialKey: `${task.taskId}:${repetition}:${arm}`,
          taskId: task.taskId,
          repetition,
          arm,
          order,
        });
      }
    }
  const fixed = {
    schemaVersion: "1.0.0" as const,
    ablationPlanSchemaVersion: "1.0.0" as const,
    candidateId: options.candidate.candidateId,
    candidateHash: options.candidate.candidateHash,
    phase: options.phase,
    taskSnapshots: tasks,
    invariant: { ...options.invariant, environmentNames },
    baseline: options.baseline,
    candidate: {
      variantId: `candidate-${options.candidate.candidateId}`,
      resourceHash: options.candidateResourceHash,
      declaredVariable: options.candidate.mutation.declaredVariable,
      mutationFiles: options.candidate.mutation.files,
    },
    repetitionCount: options.repetitionCount,
    trials,
  };
  return { ...fixed, planHash: canonicalHash(fixed) };
}

function fileMap(
  snapshot: AblationResourceSnapshot,
  label: string,
): ReadonlyMap<string, ContentHash> {
  const result = new Map<string, ContentHash>();
  for (const file of snapshot.files) {
    if (result.has(file.logicalPath))
      fail(
        "ABLATION_RESOURCE_DUPLICATE",
        "CONFLICT",
        `${label} resource snapshot contains a duplicate path.`,
        label,
      );
    result.set(file.logicalPath, file.hash);
  }
  return result;
}

export function assertOneVariableAblation(options: {
  readonly plan: FrozenAblationPlanV1;
  readonly baseline: AblationResourceSnapshot;
  readonly candidate: AblationResourceSnapshot;
}): readonly string[] {
  const baseline = fileMap(options.baseline, "baseline");
  const candidate = fileMap(options.candidate, "candidate");
  const declared = new Map(
    options.plan.candidate.mutationFiles.map((file) => [
      file.logicalPath,
      file,
    ]),
  );
  const allPaths = new Set([...baseline.keys(), ...candidate.keys()]);
  const changed = [...allPaths]
    .filter((path) => baseline.get(path) !== candidate.get(path))
    .sort();
  if (
    changed.length !== declared.size ||
    changed.some((path) => !declared.has(path))
  )
    fail(
      "ABLATION_CONTAMINATION_EXTRA_CHANGE",
      "SAFETY",
      "Resource arms differ outside the declared mutation set.",
      "candidate.mutationFiles",
    );
  for (const [path, mutation] of declared) {
    if (
      baseline.get(path) !== mutation.beforeHash ||
      candidate.get(path) !== mutation.afterHash
    )
      fail(
        "ABLATION_CONTAMINATION_HASH_MISMATCH",
        "SAFETY",
        `Resource mutation '${path}' does not match declared before/after hashes.`,
        path,
      );
  }
  return [
    "baseline_and_candidate_invariants_frozen",
    "resource_difference_equals_one_declared_mutation_set",
    "no_extra_resource_changes_detected",
  ];
}

export async function runAblationPlan(options: {
  readonly plan: FrozenAblationPlanV1;
  readonly baselineSnapshot: AblationResourceSnapshot;
  readonly candidateSnapshot: AblationResourceSnapshot;
  readonly evaluate: AblationEvaluator;
  readonly signal: AbortSignal;
}): Promise<AblationExecutionV1> {
  const contaminationChecks = assertOneVariableAblation({
    plan: options.plan,
    baseline: options.baselineSnapshot,
    candidate: options.candidateSnapshot,
  });
  const outcomes: AblationExecutionV1["outcomes"][number][] = [];
  for (const trial of options.plan.trials) {
    if (options.signal.aborted)
      return {
        schemaVersion: "1.0.0",
        planHash: options.plan.planHash,
        candidateId: options.plan.candidateId,
        status: "interrupted",
        outcomes,
        contaminationChecks,
      };
    const outcome = await options.evaluate(trial, options.signal);
    if (outcome.trialKey !== trial.trialKey || outcome.arm !== trial.arm)
      fail(
        "ABLATION_OUTCOME_IDENTITY_MISMATCH",
        "CONFLICT",
        "Evaluator returned an outcome for a different trial.",
        "outcome.trialKey",
      );
    outcomes.push(outcome);
  }
  return {
    schemaVersion: "1.0.0",
    planHash: options.plan.planHash,
    candidateId: options.plan.candidateId,
    status: outcomes.some(
      (outcome) => outcome.status === "unavailable" || !outcome.hardGatesPassed,
    )
      ? "failed"
      : "completed",
    outcomes,
    contaminationChecks,
  };
}
