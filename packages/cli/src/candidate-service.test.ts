import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalJson,
  sha256,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
  type ParetoSelectionV1,
} from "@patchrace/contracts";
import { PlaceholderCommandService } from "@patchrace/core";
import {
  buildCandidateReview,
  createDecisionPolicy,
  createPromotionPlan,
  generateAgentsGuidanceCandidate,
  recordCandidateReviewDecision,
  stageCandidate,
} from "@patchrace/optimizer";

import { CandidateCommandService } from "./candidate-service.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-candidate-service-"));
  roots.push(root);
  return root;
}

const evidence: EvidenceCitationV1 = {
  runId: "run_01K0FAKE000000000000000000",
  trialId: "trial_01K0FAKE000000000000000000",
  artifactHash: sha256("grade"),
  logicalPath: "grade.json",
};
const finding: DiagnosisFindingV1 = {
  schemaVersion: "1.0.0",
  id: "diag_context",
  category: "context",
  confidence: "high",
  claim: "A stable repository constraint failed.",
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

async function staged(project: string) {
  const original = "# Existing guidance\n";
  await writeFile(join(project, "AGENTS.md"), original);
  const generated = generateAgentsGuidanceCandidate({
    baselineId: "pi-main",
    createdAt: "2026-07-23T00:00:00Z",
    route,
    finding,
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
    currentContent: original,
    change: {
      kind: "add-stable-fact",
      fact: "Use the configured package manager for repository checks.",
    },
  });
  const value = await stageCandidate({
    projectRoot: project,
    candidate: generated.candidate,
    files: generated.files,
    lint: { securityFlags: generated.securityFlags },
  });
  const pending = buildCandidateReview({
    generated,
    findings: [finding],
    expectedEffect: "Reduce recorded package-manager constraint failures.",
  });
  const reviewRoot = join(project, value.relativeRoot, "review");
  await mkdir(reviewRoot);
  await writeFile(
    join(reviewRoot, "review.json"),
    `${canonicalJson(pending.review)}\n`,
  );
  return { generated, pending, relativeRoot: value.relativeRoot, original };
}

describe("candidate CLI service", () => {
  it("reads immutable review evidence and appends one explicit decision", async () => {
    const project = await projectRoot();
    const value = await staged(project);
    const service = new CandidateCommandService(
      new PlaceholderCommandService(),
      { now: () => new Date("2026-07-23T02:00:00Z") },
    );

    const reviewed = await service.execute({
      command: "candidate review",
      options: {
        project,
        candidateId: value.generated.candidate.candidateId,
      },
    });
    expect(
      (reviewed.data as { review: { exactDiffs: unknown[] } }).review
        .exactDiffs,
    ).toHaveLength(1);

    const decided = await service.execute({
      command: "candidate decide",
      options: {
        project,
        candidateId: value.generated.candidate.candidateId,
        approve: true,
        reason: "Exact evidence is narrow and ready for validation.",
      },
    });
    expect(
      (decided.data as { review: { decision: { state: string } } }).review
        .decision.state,
    ).toBe("approved");
    await expect(
      service.execute({
        command: "candidate decide",
        options: {
          project,
          candidateId: value.generated.candidate.candidateId,
          reject: true,
          reason: "A second terminal decision must not overwrite evidence.",
        },
      }),
    ).rejects.toMatchObject({
      details: { code: "CANDIDATE_DECISION_EXISTS" },
    });
  });

  it("previews, promotes, and conflict-safe rolls back exact staged bytes", async () => {
    const project = await projectRoot();
    await writeFile(join(project, "sentinel.txt"), "preserve\n");
    const value = await staged(project);
    const approved = recordCandidateReviewDecision(value.pending, {
      decision: "approved",
      reason: "The exact diff and evidence are narrow and complete.",
      reviewedAt: "2026-07-23T01:00:00Z",
    });
    const policy = createDecisionPolicy({
      requiredDimensions: ["successRate"],
      minimumSuccessRateImprovement: 0.1,
      maximumRegression: {},
      evidenceTier: "validation",
    });
    const selection: ParetoSelectionV1 = {
      schemaVersion: "1.0.0",
      policyHash: policy.policyHash,
      baselineVectorHash: sha256("baseline-vector"),
      frontier: [value.generated.candidate.candidateId],
      decisions: [
        {
          candidateId: value.generated.candidate.candidateId,
          decision: "promote-eligible",
          dominatedBy: [],
          reasons: ["pareto-frontier-under-frozen-policy"],
          limitations: [],
        },
      ],
      rationale: [],
    };
    const plan = await createPromotionPlan({
      projectRoot: project,
      candidate: approved.candidate,
      files: value.generated.files,
      review: approved.review,
      selection,
      policy,
    });
    const teachingRoot = join(project, value.relativeRoot, "teaching");
    await mkdir(teachingRoot);
    await writeFile(
      join(teachingRoot, "report.json"),
      `${canonicalJson({
        candidate: approved.candidate,
        review: approved.review,
        validation: { passed: true },
        policy,
        selection,
        promotion: plan,
        claimBoundary: "Fixture validation only.",
      })}\n`,
    );
    const service = new CandidateCommandService(
      new PlaceholderCommandService(),
      { now: () => new Date("2026-07-23T03:00:00Z") },
    );
    const options = {
      project,
      candidateId: value.generated.candidate.candidateId,
      target: "project",
    };

    const preview = await service.execute({
      command: "promote",
      options: { ...options, preview: true },
    });
    expect(preview.status).toBe("dry-run");
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      value.original,
    );

    const promoted = await service.execute({
      command: "promote",
      options: { ...options, confirm: true },
    });
    const promotionId = (promoted.data as { promotionId: string }).promotionId;
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toContain(
      "configured package manager",
    );
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );

    const rollbackPreview = await service.execute({
      command: "rollback",
      options: { project, promotionId, preview: true },
    });
    expect(rollbackPreview.status).toBe("dry-run");
    await service.execute({
      command: "rollback",
      options: { project, promotionId, confirm: true },
    });
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      value.original,
    );
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });
});
