import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  sha256,
  type HoldoutAccessV1,
  type OptimizationSplitViewV1,
  type SplitTaskInputV1,
  type TaskSplit,
  type TaskSplitManifestV1,
} from "@patchrace/contracts";

export interface CreateTaskSplitOptions {
  readonly tasks: readonly SplitTaskInputV1[];
  readonly seed: string;
  readonly ratios?: Readonly<Record<TaskSplit, number>>;
}

const defaultRatios: Readonly<Record<TaskSplit, number>> = {
  training: 0.6,
  validation: 0.2,
  holdout: 0.2,
};

function splitError(
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

function validateInputs(options: CreateTaskSplitOptions): void {
  if (options.tasks.length === 0)
    throw splitError(
      "TASK_SPLIT_EMPTY",
      "At least one task is required for splitting.",
      "tasks",
    );
  if (options.seed.length === 0)
    throw splitError(
      "TASK_SPLIT_SEED_EMPTY",
      "Split seed must not be empty.",
      "seed",
    );
  const seen = new Set<string>();
  for (const [index, task] of options.tasks.entries()) {
    if (seen.has(task.id))
      throw splitError(
        "TASK_SPLIT_DUPLICATE_ID",
        `Task id '${task.id}' is duplicated.`,
        `tasks[${index}].id`,
      );
    seen.add(task.id);
    if (!/^sha256:[a-f0-9]{64}$/.test(task.taskHash))
      throw splitError(
        "TASK_SPLIT_HASH_INVALID",
        `Task '${task.id}' has an invalid task hash.`,
        `tasks[${index}].taskHash`,
      );
    if (task.category.length === 0)
      throw splitError(
        "TASK_SPLIT_CATEGORY_EMPTY",
        `Task '${task.id}' has an empty category.`,
        `tasks[${index}].category`,
      );
  }
  const ratios = options.ratios ?? defaultRatios;
  const values = [ratios.training, ratios.validation, ratios.holdout];
  if (
    values.some((value) => !Number.isFinite(value) || value <= 0) ||
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9
  )
    throw splitError(
      "TASK_SPLIT_RATIOS_INVALID",
      "Training, validation, and holdout ratios must be positive and sum to one.",
      "ratios",
    );
}

function groupCounts(
  count: number,
  ratios: Readonly<Record<TaskSplit, number>>,
  groupHash: string,
): Readonly<Record<TaskSplit, number>> {
  if (count === 1) return { training: 1, validation: 0, holdout: 0 };
  if (count === 2) {
    const chooseValidation = Number.parseInt(groupHash.slice(-2), 16) % 2 === 0;
    return {
      training: 1,
      validation: chooseValidation ? 1 : 0,
      holdout: chooseValidation ? 0 : 1,
    };
  }
  let validation = Math.max(1, Math.round(count * ratios.validation));
  let holdout = Math.max(1, Math.round(count * ratios.holdout));
  while (validation + holdout > count - 1) {
    if (validation >= holdout && validation > 1) validation -= 1;
    else if (holdout > 1) holdout -= 1;
    else break;
  }
  return { training: count - validation - holdout, validation, holdout };
}

function manifestPayload(
  manifest: Omit<TaskSplitManifestV1, "manifestHash">,
): unknown {
  return manifest;
}

export function createTaskSplit(
  options: CreateTaskSplitOptions,
): TaskSplitManifestV1 {
  validateInputs(options);
  const ratios = options.ratios ?? defaultRatios;
  const tasks = [...options.tasks].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const seedHash = sha256(options.seed);
  const assignments: Record<TaskSplit, string[]> = {
    training: [],
    validation: [],
    holdout: [],
  };
  const categories: Record<
    string,
    Record<TaskSplit, number> & { total: number }
  > = {};
  const grouped = new Map<string, SplitTaskInputV1[]>();
  for (const task of tasks) {
    const group = grouped.get(task.category) ?? [];
    group.push(task);
    grouped.set(task.category, group);
  }
  for (const [category, group] of [...grouped.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const ranked = [...group].sort((left, right) => {
      const leftHash = sha256(
        `${options.seed}\0${category}\0${left.id}\0${left.taskHash}`,
      );
      const rightHash = sha256(
        `${options.seed}\0${category}\0${right.id}\0${right.taskHash}`,
      );
      return (
        leftHash.localeCompare(rightHash) || left.id.localeCompare(right.id)
      );
    });
    const counts = groupCounts(
      ranked.length,
      ratios,
      sha256(`${options.seed}\0${category}`),
    );
    assignments.training.push(
      ...ranked.slice(0, counts.training).map((task) => task.id),
    );
    assignments.validation.push(
      ...ranked
        .slice(counts.training, counts.training + counts.validation)
        .map((task) => task.id),
    );
    assignments.holdout.push(
      ...ranked
        .slice(counts.training + counts.validation)
        .map((task) => task.id),
    );
    categories[category] = { total: ranked.length, ...counts };
  }
  for (const split of ["training", "validation", "holdout"] as const)
    assignments[split].sort();
  const taskSetHash = canonicalHash(tasks);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const holdoutCommitmentHash = canonicalHash(
    assignments.holdout.map((id) => byId.get(id)),
  );
  const withoutHash: Omit<TaskSplitManifestV1, "manifestHash"> = {
    schemaVersion: SCHEMA_VERSION,
    algorithm: "category-hash-v1",
    seedHash,
    taskSetHash,
    tasks,
    assignments,
    categories,
    holdoutCommitmentHash,
  };
  return {
    ...withoutHash,
    manifestHash: canonicalHash(manifestPayload(withoutHash)),
  };
}

export function verifyTaskSplit(manifest: TaskSplitManifestV1): void {
  const { manifestHash, ...payload } = manifest;
  if (canonicalHash(manifestPayload(payload)) !== manifestHash)
    throw splitError(
      "TASK_SPLIT_MANIFEST_TAMPERED",
      "Split manifest hash does not match its content.",
      "manifestHash",
    );
  if (canonicalHash(manifest.tasks) !== manifest.taskSetHash)
    throw splitError(
      "TASK_SPLIT_TASK_SET_TAMPERED",
      "Split task-set hash does not match its content.",
      "taskSetHash",
    );
  const known = new Set(manifest.tasks.map((task) => task.id));
  const assigned = [
    ...manifest.assignments.training,
    ...manifest.assignments.validation,
    ...manifest.assignments.holdout,
  ];
  if (
    assigned.length !== known.size ||
    new Set(assigned).size !== assigned.length ||
    assigned.some((id) => !known.has(id))
  )
    throw splitError(
      "TASK_SPLIT_ASSIGNMENTS_INVALID",
      "Every task must appear in exactly one known split.",
      "assignments",
    );
  const byId = new Map(manifest.tasks.map((task) => [task.id, task]));
  if (
    canonicalHash(manifest.assignments.holdout.map((id) => byId.get(id))) !==
    manifest.holdoutCommitmentHash
  )
    throw splitError(
      "TASK_SPLIT_HOLDOUT_COMMITMENT_TAMPERED",
      "Holdout commitment does not match its assigned tasks.",
      "holdoutCommitmentHash",
    );
}

export function createOptimizationSplitView(
  manifest: TaskSplitManifestV1,
): OptimizationSplitViewV1 {
  verifyTaskSplit(manifest);
  return {
    schemaVersion: SCHEMA_VERSION,
    manifestHash: manifest.manifestHash,
    trainingTaskIds: manifest.assignments.training,
    validationTaskIds: manifest.assignments.validation,
    holdout: {
      count: manifest.assignments.holdout.length,
      commitmentHash: manifest.holdoutCommitmentHash,
    },
  };
}

export function openFinalHoldout(
  manifest: TaskSplitManifestV1,
  options: { readonly gateId: string; readonly now?: () => Date },
): HoldoutAccessV1 {
  verifyTaskSplit(manifest);
  if (options.gateId.length === 0)
    throw splitError(
      "TASK_SPLIT_GATE_ID_EMPTY",
      "Holdout gate id is required.",
      "gateId",
    );
  const base = {
    schemaVersion: SCHEMA_VERSION,
    manifestHash: manifest.manifestHash,
    gateId: options.gateId,
    openedAt: (options.now ?? (() => new Date()))().toISOString(),
    taskIds: manifest.assignments.holdout,
  } as const;
  return { ...base, accessHash: canonicalHash(base) };
}

export function assertSplitAccess(options: {
  readonly manifest: TaskSplitManifestV1;
  readonly phase:
    "candidate-generation" | "candidate-selection" | "final-holdout";
  readonly taskIds: readonly string[];
  readonly holdoutAccess?: HoldoutAccessV1;
}): void {
  verifyTaskSplit(options.manifest);
  const allowed =
    options.phase === "candidate-generation"
      ? options.manifest.assignments.training
      : options.phase === "candidate-selection"
        ? options.manifest.assignments.validation
        : options.manifest.assignments.holdout;
  if (
    options.phase === "final-holdout" &&
    (options.holdoutAccess === undefined ||
      options.holdoutAccess.manifestHash !== options.manifest.manifestHash ||
      canonicalHash(options.holdoutAccess.taskIds) !==
        canonicalHash(options.manifest.assignments.holdout) ||
      canonicalHash({
        schemaVersion: options.holdoutAccess.schemaVersion,
        manifestHash: options.holdoutAccess.manifestHash,
        gateId: options.holdoutAccess.gateId,
        openedAt: options.holdoutAccess.openedAt,
        taskIds: options.holdoutAccess.taskIds,
      }) !== options.holdoutAccess.accessHash)
  )
    throw splitError(
      "TASK_SPLIT_HOLDOUT_ACCESS_REQUIRED",
      "Final holdout access requires a valid gate record.",
      "holdoutAccess",
    );
  const allowedSet = new Set(allowed);
  const forbidden = options.taskIds.filter((id) => !allowedSet.has(id));
  if (forbidden.length > 0)
    throw splitError(
      "TASK_SPLIT_ACCESS_FORBIDDEN",
      `Phase '${options.phase}' requested tasks outside its split.`,
      "taskIds",
    );
}
