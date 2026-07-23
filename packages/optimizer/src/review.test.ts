import { describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

import { generateAgentsGuidanceCandidate } from "./generation.js";
import {
  buildCandidateReview,
  recordCandidateReviewDecision,
} from "./review.js";

const evidence: EvidenceCitationV1 = {
  runId: "run_01K0FAKE000000000000000000",
  trialId: "trial_01K0FAKE000000000000000000",
  artifactHash: sha256("grade"),
  logicalPath: "trials/focus/grade.json",
};
const finding: DiagnosisFindingV1 = {
  schemaVersion: "1.0.0",
  id: "diag_context",
  category: "context",
  confidence: "high",
  claim: "A repository constraint failed.",
  evidence: [evidence],
  alternatives: [{ claim: "Task ambiguity." }],
  eligibleMutationTargets: ["agents-guidance"],
  limitations: [],
  origin: "deterministic-rule",
  ruleId: "constraint-v1",
};
const route: DiagnosisMutationRouteV1 = {
  schemaVersion: "1.0.0",
  routeSchemaVersion: "1.0.0",
  id: "route_context",
  disposition: "candidate",
  mutationType: "agents-guidance",
  recommendationKind: null,
  sourceFindingIds: [finding.id],
  evidence: [evidence],
  rationale: [],
  invokedWorkflow: null,
  limitations: [],
};

function generated() {
  return generateAgentsGuidanceCandidate({
    baselineId: "pi-main",
    createdAt: "2026-07-23T00:00:00Z",
    route,
    finding,
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
    currentContent: null,
    change: {
      kind: "add-stable-fact",
      fact: "Use the configured package manager for repository checks.",
    },
  });
}

describe("candidate review", () => {
  it("shows diagnosis, exact diff, flags, expected effect, and cost before decision", () => {
    const result = buildCandidateReview({
      generated: generated(),
      findings: [finding],
      expectedEffect:
        "Reduce package-manager constraint failures on validation tasks.",
    });

    expect(result.review).toMatchObject({
      sourceDiagnoses: [{ id: finding.id, evidence: [evidence] }],
      exactDiffs: [
        {
          logicalPath: "AGENTS.md",
          unifiedDiff: expect.stringContaining(
            "Use the configured package manager",
          ),
        },
      ],
      securityFlags: ["none_detected_not_a_safety_guarantee"],
      controls: {
        approve: true,
        reject: true,
        validationEnabled: false,
        activationEnabled: false,
      },
      decision: { state: "pending" },
    });
  });

  it("requires an explicit terminal decision and never enables activation", () => {
    const pending = buildCandidateReview({
      generated: generated(),
      findings: [finding],
      expectedEffect:
        "Reduce package-manager constraint failures on validation tasks.",
    });
    const approved = recordCandidateReviewDecision(pending, {
      decision: "approved",
      reason: "The diff is narrow and all cited evidence resolves.",
      reviewedAt: "2026-07-23T02:00:00Z",
    });

    expect(approved.review.controls).toMatchObject({
      validationEnabled: true,
      activationEnabled: false,
    });
    expect(approved.candidate.decision.state).toBe("approved");
    expect(() =>
      recordCandidateReviewDecision(approved, {
        decision: "rejected",
        reason: "Changed my mind after validation.",
        reviewedAt: "2026-07-23T03:00:00Z",
      }),
    ).toThrowError(PatchRaceError);
  });
});
