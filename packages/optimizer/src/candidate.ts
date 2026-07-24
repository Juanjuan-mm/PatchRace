import { isAbsolute } from "node:path";

import {
  PatchRaceError,
  canonicalHash,
  type CandidateEvaluationRecordV1,
  type CandidateFileMutationV1,
  type CandidateSnapshotV1,
  type ContentHash,
  type DiagnosisMutationRouteV1,
} from "@patchrace/contracts";

const hashPattern = /^sha256:[0-9a-f]{64}$/u;
const identifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export interface CreateCandidateOptions {
  readonly parentCandidateId?: string | null;
  readonly baselineId: string;
  readonly createdAt: string;
  readonly generator: CandidateSnapshotV1["generator"];
  readonly routes: readonly DiagnosisMutationRouteV1[];
  readonly visibleSplitHash: ContentHash;
  readonly configHash: ContentHash;
  readonly declaredVariable: string;
  readonly files: readonly CandidateFileMutationV1[];
  readonly objective: CandidateSnapshotV1["objective"];
}

function invalid(code: string, message: string, path: string): never {
  throw new PatchRaceError({
    code,
    category: "CONFIG",
    message,
    path,
  });
}

function assertHash(value: string | null, path: string): void {
  if (value !== null && !hashPattern.test(value))
    invalid("CANDIDATE_HASH_INVALID", "Candidate hash is invalid.", path);
}

function assertLogicalPath(value: string, path: string): void {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    isAbsolute(value) ||
    value.split("/").some((part) => part === "" || part === "..")
  )
    invalid(
      "CANDIDATE_PATH_INVALID",
      "Candidate target must be a safe project-relative path.",
      path,
    );
}

function targetAllowed(
  type: CandidateSnapshotV1["mutation"]["type"],
  path: string,
): boolean {
  if (type === "agents-guidance")
    return path === "AGENTS.md" || path.endsWith("/AGENTS.md");
  if (type === "skill")
    return /^\.pi\/skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md$/u.test(path);
  if (type === "prompt-template")
    return /^\.pi\/prompts\/[a-z0-9][a-z0-9-]*\.md$/u.test(path);
  if (type === "settings")
    return /^\.pi\/candidate-settings\/[a-z0-9][a-z0-9-]*\.json$/u.test(path);
  return /^\.patchrace\/resource-selections\/[a-z0-9][a-z0-9-]*\.json$/u.test(
    path,
  );
}

function assertFile(
  file: CandidateFileMutationV1,
  index: number,
  mutationType: CandidateSnapshotV1["mutation"]["type"],
): void {
  const path = `mutation.files.${index}`;
  assertLogicalPath(file.logicalPath, `${path}.logicalPath`);
  if (!targetAllowed(mutationType, file.logicalPath))
    invalid(
      "CANDIDATE_TARGET_FORBIDDEN",
      `Target '${file.logicalPath}' is not allowed for '${mutationType}'.`,
      `${path}.logicalPath`,
    );
  assertHash(file.beforeHash, `${path}.beforeHash`);
  assertHash(file.afterHash, `${path}.afterHash`);
  assertHash(file.patchHash, `${path}.patchHash`);
  if (
    (file.operation === "create" &&
      (file.beforeHash !== null || file.afterHash === null)) ||
    (file.operation === "update" &&
      (file.beforeHash === null || file.afterHash === null)) ||
    (file.operation === "delete" &&
      (file.beforeHash === null || file.afterHash !== null))
  )
    invalid(
      "CANDIDATE_FILE_OPERATION_INVALID",
      "Candidate file hashes do not match the declared operation.",
      path,
    );
}

function identity(
  value: Omit<
    CandidateSnapshotV1,
    "candidateId" | "candidateHash" | "evaluationHistory" | "decision"
  >,
): { readonly candidateId: string; readonly candidateHash: ContentHash } {
  const candidateHash = canonicalHash(value);
  return {
    candidateId: `cand_${candidateHash.slice("sha256:".length, "sha256:".length + 20)}`,
    candidateHash,
  };
}

export function createCandidateSnapshot(
  options: CreateCandidateOptions,
): CandidateSnapshotV1 {
  if (!identifierPattern.test(options.baselineId))
    invalid(
      "CANDIDATE_BASELINE_INVALID",
      "Candidate baseline ID is invalid.",
      "baselineId",
    );
  if (
    options.parentCandidateId !== undefined &&
    options.parentCandidateId !== null &&
    !/^cand_[0-9a-f]{20}$/u.test(options.parentCandidateId)
  )
    invalid(
      "CANDIDATE_PARENT_INVALID",
      "Parent candidate ID is invalid.",
      "parentCandidateId",
    );
  if (!identifierPattern.test(options.declaredVariable))
    invalid(
      "CANDIDATE_VARIABLE_INVALID",
      "Declared mutation variable is invalid.",
      "declaredVariable",
    );
  if (!Number.isFinite(Date.parse(options.createdAt)))
    invalid(
      "CANDIDATE_TIME_INVALID",
      "Candidate creation time must be ISO-compatible.",
      "createdAt",
    );
  if (options.routes.length === 0)
    invalid(
      "CANDIDATE_ROUTE_MISSING",
      "Candidate requires at least one source route.",
      "routes",
    );
  if (
    options.routes.some(
      (route) =>
        route.disposition !== "candidate" ||
        route.mutationType === null ||
        route.evidence.length === 0,
    )
  )
    invalid(
      "CANDIDATE_ROUTE_INELIGIBLE",
      "Only cited candidate routes can create a candidate.",
      "routes",
    );
  const mutationTypes = new Set(
    options.routes.map((route) => route.mutationType),
  );
  if (mutationTypes.size !== 1)
    invalid(
      "CANDIDATE_MULTIPLE_VARIABLES",
      "A candidate can contain only one mutation type.",
      "routes",
    );
  const mutationType = options.routes[0]!.mutationType!;
  if (options.files.length === 0)
    invalid(
      "CANDIDATE_FILES_MISSING",
      "Candidate requires an exact file mutation.",
      "files",
    );
  options.files.forEach((file, index) => assertFile(file, index, mutationType));
  if (
    new Set(options.files.map((file) => file.logicalPath)).size !==
    options.files.length
  )
    invalid(
      "CANDIDATE_FILE_DUPLICATE",
      "Candidate file targets must be unique.",
      "files",
    );
  assertHash(options.visibleSplitHash, "visibleSplitHash");
  assertHash(options.configHash, "configHash");
  assertHash(options.generator.promptHash, "generator.promptHash");
  for (const [key, value] of Object.entries(options.objective.constraints))
    if (!Number.isFinite(value) || value < 0)
      invalid(
        "CANDIDATE_OBJECTIVE_INVALID",
        "Objective constraints must be finite and non-negative.",
        `objective.constraints.${key}`,
      );
  const fixed = {
    schemaVersion: "1.0.0" as const,
    candidateSchemaVersion: "1.0.0" as const,
    parentCandidateId: options.parentCandidateId ?? null,
    baselineId: options.baselineId,
    createdAt: new Date(options.createdAt).toISOString(),
    generator: options.generator,
    inputs: {
      routeIds: [...new Set(options.routes.map((route) => route.id))].sort(),
      diagnosisIds: [
        ...new Set(options.routes.flatMap((route) => route.sourceFindingIds)),
      ].sort(),
      evidenceHashes: [
        ...new Set(
          options.routes.flatMap((route) =>
            route.evidence.map((citation) => citation.artifactHash),
          ),
        ),
      ].sort(),
      visibleSplitHash: options.visibleSplitHash,
      configHash: options.configHash,
    },
    mutation: {
      type: mutationType,
      declaredVariable: options.declaredVariable,
      files: [...options.files].sort((left, right) =>
        left.logicalPath.localeCompare(right.logicalPath),
      ),
    },
    objective: options.objective,
  };
  const candidateIdentity = identity(fixed);
  return {
    ...fixed,
    ...candidateIdentity,
    evaluationHistory: [],
    decision: { state: "staged", reason: "awaiting-review-and-ablation" },
  };
}

export function appendCandidateEvaluation(
  candidate: CandidateSnapshotV1,
  record: CandidateEvaluationRecordV1,
): CandidateSnapshotV1 {
  const { candidateId, candidateHash } = identity({
    schemaVersion: candidate.schemaVersion,
    candidateSchemaVersion: candidate.candidateSchemaVersion,
    parentCandidateId: candidate.parentCandidateId,
    baselineId: candidate.baselineId,
    createdAt: candidate.createdAt,
    generator: candidate.generator,
    inputs: candidate.inputs,
    mutation: candidate.mutation,
    objective: candidate.objective,
  });
  if (
    candidateId !== candidate.candidateId ||
    candidateHash !== candidate.candidateHash
  )
    throw new PatchRaceError({
      code: "CANDIDATE_IDENTITY_DRIFT",
      category: "CONFLICT",
      message: "Candidate fixed identity no longer matches its recorded hash.",
      path: "candidateHash",
    });
  if (
    candidate.evaluationHistory.some(
      (existing) => existing.attemptId === record.attemptId,
    )
  )
    throw new PatchRaceError({
      code: "CANDIDATE_EVALUATION_DUPLICATE",
      category: "CONFLICT",
      message: `Evaluation attempt '${record.attemptId}' already exists.`,
      path: "evaluationHistory",
    });
  assertHash(record.planHash, "evaluation.planHash");
  assertHash(record.objectiveVectorHash, "evaluation.objectiveVectorHash");
  if (!Number.isFinite(Date.parse(record.recordedAt)))
    invalid(
      "CANDIDATE_EVALUATION_TIME_INVALID",
      "Evaluation time must be ISO-compatible.",
      "evaluation.recordedAt",
    );
  return {
    ...candidate,
    evaluationHistory: [
      ...candidate.evaluationHistory,
      { ...record, recordedAt: new Date(record.recordedAt).toISOString() },
    ],
  };
}
