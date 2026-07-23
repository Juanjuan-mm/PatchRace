import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  canonicalJson,
  type CandidateReviewV1,
  type CandidateSnapshotV1,
  type FrozenDecisionPolicyV1,
  type ParetoSelectionV1,
  type PromotionPlanV1,
  type TeachingProtocolLedgerV1,
} from "@patchrace/contracts";
import type {
  CommandRequest,
  CommandResult,
  CommandService,
} from "@patchrace/core";
import {
  createPromotionPlan,
  createRollbackPlan,
  executePromotion,
  executeRollback,
  recordCandidateReviewDecision,
  type CandidateFileContent,
} from "@patchrace/optimizer";

interface TeachingReport {
  readonly candidate: CandidateSnapshotV1;
  readonly review: CandidateReviewV1;
  readonly validation?: unknown;
  readonly policy?: FrozenDecisionPolicyV1;
  readonly selection?: ParetoSelectionV1;
  readonly promotion?: PromotionPlanV1 | null;
  readonly protocol?: TeachingProtocolLedgerV1;
  readonly claimBoundary?: string;
}

interface LoadedCandidate {
  readonly root: string;
  readonly candidate: CandidateSnapshotV1;
  readonly review: CandidateReviewV1;
  readonly lint: unknown;
  readonly decision: {
    readonly candidate: CandidateSnapshotV1;
    readonly review: CandidateReviewV1;
  } | null;
  readonly teaching: TeachingReport | null;
  readonly files: readonly CandidateFileContent[];
}

function fail(
  code: string,
  category: "USAGE" | "PREFLIGHT" | "CONFLICT" | "SAFETY",
  message: string,
  path: string,
): never {
  throw new PatchRaceError({ code, category, message, path });
}

function isDescendant(root: string, target: string): boolean {
  const difference = relative(root, target);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

async function optionalBytes(path: string): Promise<Buffer | null> {
  return readFile(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

async function optionalJson(path: string): Promise<unknown | null> {
  const bytes = await optionalBytes(path);
  return bytes === null
    ? null
    : (JSON.parse(bytes.toString("utf8")) as unknown);
}

async function candidateRoot(
  projectInput: string,
  stateInput: string,
  candidateId: string,
): Promise<{ readonly projectRoot: string; readonly root: string }> {
  if (!/^cand_[0-9a-f]{20}$/u.test(candidateId))
    fail(
      "CANDIDATE_ID_INVALID",
      "USAGE",
      "Candidate ID must use the canonical cand_<20 hex> form.",
      "candidateId",
    );
  const projectRoot = await realpath(resolve(projectInput));
  const stateRoot = await realpath(resolve(projectRoot, stateInput));
  if (!isDescendant(projectRoot, stateRoot))
    fail(
      "CANDIDATE_STATE_NOT_PROJECT_LOCAL",
      "SAFETY",
      "Candidate state must remain inside the project.",
      "stateDir",
    );
  const root = resolve(stateRoot, "candidates", candidateId);
  const info = await lstat(root).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (info === null)
    fail(
      "CANDIDATE_NOT_FOUND",
      "PREFLIGHT",
      `Candidate '${candidateId}' is not staged.`,
      "candidateId",
    );
  if (!info.isDirectory() || info.isSymbolicLink())
    fail(
      "CANDIDATE_ROOT_UNSAFE",
      "SAFETY",
      "Candidate root must be a real directory.",
      "candidateId",
    );
  const canonical = await realpath(root);
  if (!isDescendant(stateRoot, canonical))
    fail(
      "CANDIDATE_ROOT_ESCAPE",
      "SAFETY",
      "Candidate root resolves outside project state.",
      "candidateId",
    );
  return { projectRoot, root: canonical };
}

function parsed<T>(value: unknown, label: string): T {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(
      "CANDIDATE_ARTIFACT_INVALID",
      "CONFLICT",
      `Candidate ${label} artifact is invalid.`,
      label,
    );
  return value as T;
}

async function loadCandidate(
  projectInput: string,
  stateInput: string,
  candidateId: string,
): Promise<LoadedCandidate & { readonly projectRoot: string }> {
  const located = await candidateRoot(projectInput, stateInput, candidateId);
  const candidate = parsed<CandidateSnapshotV1>(
    await optionalJson(join(located.root, "candidate.json")),
    "candidate",
  );
  const review = parsed<CandidateReviewV1>(
    await optionalJson(join(located.root, "review", "review.json")),
    "review",
  );
  if (
    candidate.candidateId !== candidateId ||
    review.candidateId !== candidateId ||
    review.candidateHash !== candidate.candidateHash
  )
    fail(
      "CANDIDATE_LINEAGE_MISMATCH",
      "CONFLICT",
      "Candidate and review lineage do not match the requested candidate.",
      "candidateId",
    );
  const lint = await optionalJson(join(located.root, "lint.json"));
  const decisionValue = await optionalJson(
    join(located.root, "review", "decision.json"),
  );
  const decision =
    decisionValue === null
      ? null
      : parsed<LoadedCandidate["decision"] & object>(
          decisionValue,
          "review decision",
        );
  if (
    decision !== null &&
    (decision.candidate.candidateId !== candidateId ||
      decision.review.candidateId !== candidateId ||
      decision.review.decision.state === "pending")
  )
    fail(
      "CANDIDATE_DECISION_INVALID",
      "CONFLICT",
      "Stored review decision does not match the candidate.",
      "review/decision.json",
    );
  const teachingValue = await optionalJson(
    join(located.root, "teaching", "report.json"),
  );
  const teaching =
    teachingValue === null
      ? null
      : parsed<TeachingReport>(teachingValue, "teaching report");
  if (
    teaching !== null &&
    (teaching.candidate.candidateId !== candidateId ||
      teaching.review.candidateId !== candidateId)
  )
    fail(
      "CANDIDATE_TEACHING_LINEAGE_MISMATCH",
      "CONFLICT",
      "Teaching evidence does not match the candidate.",
      "teaching/report.json",
    );
  const files = await Promise.all(
    candidate.mutation.files.map(async (mutation) => {
      const encoded = Buffer.from(mutation.logicalPath).toString("base64url");
      const root = join(located.root, "files", encoded);
      const patch = await optionalBytes(join(root, "mutation.diff"));
      if (patch === null)
        fail(
          "CANDIDATE_STAGED_BYTES_MISSING",
          "CONFLICT",
          `Candidate diff is missing for '${mutation.logicalPath}'.`,
          mutation.logicalPath,
        );
      return {
        logicalPath: mutation.logicalPath,
        before: await optionalBytes(join(root, "before")),
        after: await optionalBytes(join(root, "after")),
        patch,
      };
    }),
  );
  return {
    ...located,
    candidate,
    review,
    lint,
    decision,
    teaching,
    files,
  };
}

export interface CandidateCommandDependencies {
  readonly now?: () => Date;
}

export class CandidateCommandService implements CommandService {
  readonly #now: () => Date;

  constructor(
    private readonly fallback: CommandService,
    dependencies: CandidateCommandDependencies = {},
  ) {
    this.#now = dependencies.now ?? (() => new Date());
  }

  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command === "candidate review") return this.review(request);
    if (request.command === "candidate decide") return this.decide(request);
    if (request.command === "promote") return this.promote(request);
    if (request.command === "rollback") return this.rollback(request);
    return this.fallback.execute(request);
  }

  private inputs(request: CommandRequest): {
    readonly project: string;
    readonly state: string;
  } {
    return {
      project: String(request.options["project"] ?? process.cwd()),
      state: String(request.options["stateDir"] ?? ".patchrace"),
    };
  }

  private async review(request: CommandRequest): Promise<CommandResult> {
    const candidateId = String(request.options["candidateId"] ?? "");
    const inputs = this.inputs(request);
    const loaded = await loadCandidate(
      inputs.project,
      inputs.state,
      candidateId,
    );
    const effective = loaded.decision ?? {
      candidate: loaded.candidate,
      review: loaded.review,
    };
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "candidate review",
      status: "completed",
      sideEffects: [],
      data: {
        candidate: effective.candidate,
        review: effective.review,
        lint: loaded.lint,
        validation: loaded.teaching?.validation ?? null,
        policy: loaded.teaching?.policy ?? null,
        selection: loaded.teaching?.selection ?? null,
        promotion: loaded.teaching?.promotion ?? null,
        claimBoundary: loaded.teaching?.claimBoundary ?? null,
      },
    };
  }

  private async decide(request: CommandRequest): Promise<CommandResult> {
    const approve = request.options["approve"] === true;
    const reject = request.options["reject"] === true;
    if (approve === reject)
      fail(
        "CANDIDATE_DECISION_REQUIRED",
        "USAGE",
        "Choose exactly one of --approve or --reject.",
        "decision",
      );
    const candidateId = String(request.options["candidateId"] ?? "");
    const reason = String(request.options["reason"] ?? "");
    const inputs = this.inputs(request);
    const loaded = await loadCandidate(
      inputs.project,
      inputs.state,
      candidateId,
    );
    if (loaded.decision !== null)
      fail(
        "CANDIDATE_DECISION_EXISTS",
        "CONFLICT",
        "Candidate already has a durable review decision.",
        "review/decision.json",
      );
    const result = recordCandidateReviewDecision(
      { candidate: loaded.candidate, review: loaded.review },
      {
        decision: approve ? "approved" : "rejected",
        reason,
        reviewedAt: this.#now().toISOString(),
      },
    );
    const path = join(loaded.root, "review", "decision.json");
    await writeFile(path, `${canonicalJson(result)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "candidate decide",
      status: "completed",
      sideEffects: [path],
      data: result,
    };
  }

  private async promote(request: CommandRequest): Promise<CommandResult> {
    if (
      request.options["target"] !== undefined &&
      request.options["target"] !== "project"
    )
      fail(
        "PROMOTION_TARGET_SCOPE_INVALID",
        "USAGE",
        "Only project-local promotion is supported.",
        "target",
      );
    const candidateId = String(request.options["candidateId"] ?? "");
    const inputs = this.inputs(request);
    const loaded = await loadCandidate(
      inputs.project,
      inputs.state,
      candidateId,
    );
    const teaching = loaded.teaching;
    if (
      teaching?.policy === undefined ||
      teaching.selection === undefined ||
      teaching.promotion == null
    )
      fail(
        "PROMOTION_EVIDENCE_UNAVAILABLE",
        "PREFLIGHT",
        "Candidate has no promote-eligible validation evidence and preview.",
        "teaching/report.json",
      );
    const plan = await createPromotionPlan({
      projectRoot: loaded.projectRoot,
      candidate: teaching.candidate,
      files: loaded.files,
      review: teaching.review,
      selection: teaching.selection,
      policy: teaching.policy,
      ...(teaching.protocol === undefined
        ? {}
        : { protocol: teaching.protocol }),
    });
    if (canonicalHash(plan) !== canonicalHash(teaching.promotion))
      fail(
        "PROMOTION_PREVIEW_DRIFT",
        "CONFLICT",
        "Stored promotion preview no longer matches candidate evidence.",
        "teaching.promotion",
      );
    const confirmed = request.options["confirm"] === true;
    const result = await executePromotion({
      projectRoot: loaded.projectRoot,
      plan,
      files: loaded.files,
      confirm: confirmed,
      now: this.#now,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "promote",
      status: confirmed ? "completed" : "dry-run",
      sideEffects: confirmed
        ? plan.targets.map((target) =>
            resolve(loaded.projectRoot, target.logicalPath),
          )
        : [],
      data: result,
    };
  }

  private async rollback(request: CommandRequest): Promise<CommandResult> {
    const promotionId = String(request.options["promotionId"] ?? "");
    const inputs = this.inputs(request);
    const projectRoot = await realpath(resolve(inputs.project));
    const plan = await createRollbackPlan({ projectRoot, promotionId });
    const confirmed = request.options["confirm"] === true;
    const result = await executeRollback({
      projectRoot,
      plan,
      confirm: confirmed,
      now: this.#now,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "rollback",
      status: confirmed ? "completed" : "dry-run",
      sideEffects: confirmed
        ? plan.targets.map((target) => resolve(projectRoot, target.logicalPath))
        : [],
      data: result,
    };
  }
}
