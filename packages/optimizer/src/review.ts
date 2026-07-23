import {
  PatchRaceError,
  canonicalHash,
  sha256,
  type CandidateReviewV1,
  type CandidateSnapshotV1,
  type DiagnosisFindingV1,
} from "@patchrace/contracts";

import type { GeneratedCandidate } from "./generation.js";

export interface CandidateReviewResult {
  readonly review: CandidateReviewV1;
  readonly candidate: CandidateSnapshotV1;
}

function fail(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "CONFLICT", message, path });
}

export function buildCandidateReview(options: {
  readonly generated: GeneratedCandidate;
  readonly findings: readonly DiagnosisFindingV1[];
  readonly expectedEffect: string;
  readonly limitations?: readonly string[];
}): CandidateReviewResult {
  const expectedEffect = options.expectedEffect.trim();
  if (
    expectedEffect.length < 12 ||
    expectedEffect.length > 300 ||
    expectedEffect.includes("\n")
  )
    fail(
      "CANDIDATE_REVIEW_EFFECT_INVALID",
      "Expected effect must be one bounded line.",
      "expectedEffect",
    );
  const candidate = options.generated.candidate;
  const findingIds = new Set(candidate.inputs.diagnosisIds);
  const findings = options.findings
    .filter((finding) => findingIds.has(finding.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (
    findings.length !== findingIds.size ||
    findings.some((finding) => finding.evidence.length === 0)
  )
    fail(
      "CANDIDATE_REVIEW_DIAGNOSIS_MISSING",
      "Review requires every cited source diagnosis.",
      "findings",
    );
  const contentByPath = new Map(
    options.generated.files.map((file) => [file.logicalPath, file]),
  );
  const exactDiffs = candidate.mutation.files.map((mutation) => {
    const content = contentByPath.get(mutation.logicalPath);
    if (content === undefined || sha256(content.patch) !== mutation.patchHash)
      fail(
        "CANDIDATE_REVIEW_DIFF_MISMATCH",
        `Review diff for '${mutation.logicalPath}' does not match the candidate.`,
        "generated.files",
      );
    return {
      logicalPath: mutation.logicalPath,
      patchHash: mutation.patchHash,
      unifiedDiff: Buffer.from(content.patch).toString("utf8"),
    };
  });
  const fixed = {
    schemaVersion: "1.0.0" as const,
    reviewSchemaVersion: "1.0.0" as const,
    candidateId: candidate.candidateId,
    candidateHash: candidate.candidateHash,
    mutationType: candidate.mutation.type,
    sourceDiagnoses: findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      confidence: finding.confidence,
      claim: finding.claim,
      evidence: finding.evidence,
    })),
    exactDiffs,
    securityFlags:
      options.generated.securityFlags.length === 0
        ? ["none_detected_not_a_safety_guarantee"]
        : [...options.generated.securityFlags].sort(),
    expectedEffect,
    cost: {
      addedLines: options.generated.complexity.addedLines,
      removedLines: options.generated.complexity.removedLines,
      contextTokenDelta: options.generated.complexity.contextTokenDelta,
      estimatedContextTokensAfter:
        options.generated.complexity.afterContextTokens,
    },
    limitations: [
      ...(options.limitations ?? []),
      "approval_enables_validation_only_not_activation",
      "generated_instructions_remain_untrusted_until_validated",
    ],
  };
  const reviewId = `review_${canonicalHash(fixed).slice("sha256:".length, "sha256:".length + 20)}`;
  return {
    candidate,
    review: {
      ...fixed,
      reviewId,
      controls: {
        approve: true,
        reject: true,
        validationEnabled: false,
        activationEnabled: false,
      },
      decision: { state: "pending", reason: null, reviewedAt: null },
    },
  };
}

export function recordCandidateReviewDecision(
  value: CandidateReviewResult,
  options: {
    readonly decision: "approved" | "rejected";
    readonly reason: string;
    readonly reviewedAt: string;
  },
): CandidateReviewResult {
  if (value.review.decision.state !== "pending")
    fail(
      "CANDIDATE_REVIEW_ALREADY_DECIDED",
      "Candidate review already has a terminal decision.",
      "decision",
    );
  const reason = options.reason.trim();
  if (
    reason.length < 8 ||
    reason.length > 500 ||
    !Number.isFinite(Date.parse(options.reviewedAt))
  )
    fail(
      "CANDIDATE_REVIEW_DECISION_INVALID",
      "Review decision requires a bounded reason and valid timestamp.",
      "decision",
    );
  const approved = options.decision === "approved";
  return {
    review: {
      ...value.review,
      controls: {
        approve: false,
        reject: false,
        validationEnabled: approved,
        activationEnabled: false,
      },
      decision: {
        state: options.decision,
        reason,
        reviewedAt: new Date(options.reviewedAt).toISOString(),
      },
    },
    candidate: {
      ...value.candidate,
      decision: {
        state: approved ? "approved" : "rejected",
        reason: approved
          ? "explicit-review-approved-for-validation"
          : "explicit-review-rejected",
      },
    },
  };
}
