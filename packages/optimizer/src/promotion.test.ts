import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
  type ParetoSelectionV1,
} from "@patchrace/contracts";

import {
  generateAgentsGuidanceCandidate,
  type GeneratedCandidate,
} from "./generation.js";
import { createDecisionPolicy } from "./pareto.js";
import {
  createPromotionPlan,
  createRollbackPlan,
  executePromotion,
  executeRollback,
} from "./promotion.js";
import {
  buildCandidateReview,
  recordCandidateReviewDecision,
} from "./review.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "patchrace-promotion-"));
  roots.push(value);
  return value;
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

function generated(currentContent: string): GeneratedCandidate {
  return generateAgentsGuidanceCandidate({
    baselineId: "pi-main",
    createdAt: "2026-07-23T00:00:00Z",
    route,
    finding,
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
    currentContent,
    change: {
      kind: "add-stable-fact",
      fact: "Use the configured package manager for repository checks.",
    },
  });
}

function authority(value: GeneratedCandidate) {
  const pending = buildCandidateReview({
    generated: value,
    findings: [finding],
    expectedEffect: "Reduce recorded package-manager constraint failures.",
  });
  const approved = recordCandidateReviewDecision(pending, {
    decision: "approved",
    reason: "The exact diff and cited evidence are narrow and complete.",
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
    frontier: [value.candidate.candidateId],
    decisions: [
      {
        candidateId: value.candidate.candidateId,
        decision: "promote-eligible",
        dominatedBy: [],
        reasons: ["pareto-frontier-under-frozen-policy"],
        limitations: [],
      },
    ],
    rationale: [],
  };
  return { approved, policy, selection };
}

describe("promotion and rollback", () => {
  it("previews without writes, promotes only the declared file, and rolls back exactly", async () => {
    const project = await root();
    const original = "# Existing guidance\n";
    await writeFile(join(project, "AGENTS.md"), original);
    await writeFile(join(project, "sentinel.txt"), "preserve\n");
    const value = generated(original);
    const { approved, policy, selection } = authority(value);
    const plan = await createPromotionPlan({
      projectRoot: project,
      candidate: approved.candidate,
      files: value.files,
      review: approved.review,
      selection,
      policy,
    });

    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(original);
    await expect(access(join(project, ".patchrace"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      await executePromotion({
        projectRoot: project,
        plan,
        files: value.files,
        confirm: false,
        now: () => new Date("2026-07-23T02:00:00Z"),
      }),
    ).toEqual(plan);

    const promoted = await executePromotion({
      projectRoot: project,
      plan,
      files: value.files,
      confirm: true,
      now: () => new Date("2026-07-23T02:00:00Z"),
    });
    expect(promoted).toMatchObject({ state: "promoted" });
    const promotedContent = await readFile(join(project, "AGENTS.md"), "utf8");
    expect(promotedContent).toContain("Use the configured package manager");
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );

    const rollback = await createRollbackPlan({
      projectRoot: project,
      promotionId: plan.promotionId,
    });
    expect(
      await executeRollback({
        projectRoot: project,
        plan: rollback,
        confirm: false,
        now: () => new Date("2026-07-23T03:00:00Z"),
      }),
    ).toEqual(rollback);
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      promotedContent,
    );
    const rolledBack = await executeRollback({
      projectRoot: project,
      plan: rollback,
      confirm: true,
      now: () => new Date("2026-07-23T03:00:00Z"),
    });
    expect(rolledBack).toMatchObject({ state: "rolled-back" });
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(original);
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
    await expect(
      createRollbackPlan({
        projectRoot: project,
        promotionId: plan.promotionId,
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
  });

  it("refuses rollback after postimage divergence", async () => {
    const project = await root();
    const original = "# Existing guidance\n";
    await writeFile(join(project, "AGENTS.md"), original);
    const value = generated(original);
    const { approved, policy, selection } = authority(value);
    const plan = await createPromotionPlan({
      projectRoot: project,
      candidate: approved.candidate,
      files: value.files,
      review: approved.review,
      selection,
      policy,
    });
    await executePromotion({
      projectRoot: project,
      plan,
      files: value.files,
      confirm: true,
      now: () => new Date("2026-07-23T02:00:00Z"),
    });
    await writeFile(join(project, "AGENTS.md"), "user changed this\n");

    await expect(
      createRollbackPlan({
        projectRoot: project,
        promotionId: plan.promotionId,
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      "user changed this\n",
    );
  });

  it("refuses symlink targets and held-out promotion without a passed gate", async () => {
    const project = await root();
    const outside = await root();
    const original = "# Existing guidance\n";
    await writeFile(join(outside, "AGENTS.md"), original);
    await symlink(join(outside, "AGENTS.md"), join(project, "AGENTS.md"));
    const value = generated(original);
    const { approved, selection } = authority(value);
    const heldOutPolicy = createDecisionPolicy({
      requiredDimensions: ["successRate"],
      minimumSuccessRateImprovement: 0.1,
      maximumRegression: {},
      evidenceTier: "held-out",
    });

    await expect(
      createPromotionPlan({
        projectRoot: project,
        candidate: approved.candidate,
        files: value.files,
        review: approved.review,
        selection: { ...selection, policyHash: heldOutPolicy.policyHash },
        policy: heldOutPolicy,
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
  });
});
