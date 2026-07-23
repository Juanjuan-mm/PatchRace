import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  sha256,
  type DiagnosisFindingV1,
  type DiagnosisReportV1,
  type EvidenceCitationV1,
  type ObjectiveDimension,
  type ObjectiveMetricV1,
  type TrajectoryFeaturesV1,
} from "@patchrace/contracts";
import type {
  CommandRequest,
  CommandResult,
  CommandService,
} from "@patchrace/core";
import { createObjectiveVector } from "@patchrace/optimizer";

import {
  TeachingCommandService,
  type TeachingEvaluator,
} from "./teaching-service.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const trialId = "trial_fixture" as const;
const evidence: EvidenceCitationV1 = {
  runId: "run_fixture",
  trialId,
  artifactHash: sha256("grade"),
  logicalPath: "trials/trial_fixture/grade.json",
  gradeGateIds: ["constraint:package-manager"],
};
const finding: DiagnosisFindingV1 = {
  schemaVersion: SCHEMA_VERSION,
  id: "diag_context",
  category: "context",
  confidence: "high",
  claim: "An explicit repository package-manager constraint failed.",
  evidence: [evidence],
  alternatives: [{ claim: "The task may be ambiguous." }],
  eligibleMutationTargets: ["agents-guidance"],
  limitations: [],
  origin: "deterministic-rule",
  ruleId: "explicit-constraint-gate-failure-v1",
};

function unavailable(reason: string) {
  return {
    value: null,
    availability: "unavailable" as const,
    evidenceEventIds: [],
    reason,
  };
}

const trace: EvidenceCitationV1 = {
  runId: "run_fixture",
  trialId,
  artifactHash: sha256("trace"),
  logicalPath: "trials/trial_fixture/trace.jsonl",
  eventIds: [],
};
const features: TrajectoryFeaturesV1 = {
  schemaVersion: SCHEMA_VERSION,
  featureSchemaVersion: "1.0.0",
  trialId,
  trace,
  traceCompleteness: "complete",
  fileCoverage: unavailable("not-needed"),
  searchLoops: unavailable("not-needed"),
  commandFailures: unavailable("not-needed"),
  timeToFirstTestMs: unavailable("not-needed"),
  testOrder: unavailable("not-needed"),
  editFootprint: unavailable("not-needed"),
  retries: unavailable("not-needed"),
  limitations: [],
};
const diagnosis: DiagnosisReportV1 = {
  schemaVersion: SCHEMA_VERSION,
  reportSchemaVersion: "1.0.0",
  source: {
    runId: "run_fixture",
    planHash: sha256("plan"),
    artifacts: [
      {
        trialId,
        logicalPath: evidence.logicalPath,
        hash: evidence.artifactHash,
        eventIds: [],
        gradeGateIds: ["constraint:package-manager"],
      },
    ],
  },
  overview: {
    title: "Fixture diagnosis",
    focusVariantId: "pi-main",
    caseCount: 1,
    findingCount: 1,
    claimBoundary: "fixture only",
  },
  cases: [
    {
      taskId: "task-fixture",
      trialId,
      variantId: "pi-main",
      identity: {
        taskHash: sha256("task"),
        adapterId: "pi",
        model: "fixture-model",
        harnessHash: sha256("harness"),
        workflowHash: sha256("workflow"),
      },
      deterministic: {
        schemaVersion: SCHEMA_VERSION,
        diagnosisSchemaVersion: "1.0.0",
        trialId,
        deterministicFacts: {
          integrity: "valid",
          outcome: "failed",
          hardGates: [{ id: "constraint:package-manager", status: "failed" }],
        },
        findings: [finding],
        limitations: [],
      },
      features,
      alignment: null,
      findings: [finding],
      classification: {
        schemaVersion: SCHEMA_VERSION,
        classificationSchemaVersion: "1.0.0",
        trialId,
        classification: "workflow-or-configuration-gap",
        confidence: "high",
        recommendation: "consider-project-workflow-mutation",
        eligibleMutationTargets: ["agents-guidance"],
        sourceFindingIds: [finding.id],
        evidence: [evidence],
        reasons: ["high-confidence"],
        limitations: [],
      },
      reflection: null,
    },
  ],
  caveats: [],
};

class FixtureDiagnosisService implements CommandService {
  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command !== "diagnose")
      throw new Error(`Unexpected command ${request.command}`);
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "diagnose",
      status: "completed",
      sideEffects: [],
      data: { report: diagnosis },
    };
  }
}

const units: Record<ObjectiveDimension, string> = {
  successRate: "ratio",
  stabilityVariance: "ratio2",
  costUsd: "usd",
  latencyMs: "ms",
  footprintLines: "lines",
  contextTokens: "estimated-tokens",
  configComplexity: "points",
};

function metric(
  dimension: ObjectiveDimension,
  value: number,
): ObjectiveMetricV1 {
  return {
    availability: "observed",
    value,
    unit: units[dimension],
    sampleCount: 2,
    taskIds: ["task-fixture"],
    repetitions: 2,
    variance: 0,
    interval: null,
    sourceArtifactHashes: [sha256(`${dimension}-${value}`)],
  };
}

const evaluator: TeachingEvaluator = {
  async validate(options) {
    const vector = (
      candidateId: string,
      successRate: number,
      contextTokens: number,
      configComplexity: number,
    ) =>
      createObjectiveVector({
        candidateId,
        phase: "validation",
        hardGates: {
          integrity: true,
          correctness: true,
          safety: true,
          protectedPaths: true,
        },
        metrics: {
          successRate: metric("successRate", successRate),
          stabilityVariance: metric("stabilityVariance", 0),
          costUsd: metric("costUsd", 0),
          latencyMs: metric("latencyMs", 100),
          footprintLines: metric("footprintLines", 1),
          contextTokens: metric("contextTokens", contextTokens),
          configComplexity: metric("configComplexity", configComplexity),
        },
      });
    return {
      baseline: vector("baseline", 0, 0, 0),
      candidate: vector(options.candidate.candidateId, 1, 20, 1),
      limitations: ["deterministic-fixture-evaluator"],
    };
  },
};

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-teach-cli-"));
  roots.push(root);
  await writeFile(join(root, "AGENTS.md"), "# Existing\n");
  await mkdir(join(root, ".patchrace", "runs", "run_fixture"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".patchrace", "runs", "run_fixture", "manifest.json"),
    JSON.stringify({ createdAt: "2026-07-23T00:00:00Z" }),
  );
  return root;
}

describe("teach pi command service", () => {
  it("composes diagnose through promotion preview within budget without activation", async () => {
    const root = await project();
    const service = new TeachingCommandService(new FixtureDiagnosisService(), {
      evaluator,
      now: () => new Date("2026-07-23T01:00:00Z"),
    });

    const result = await service.execute({
      command: "teach pi",
      options: {
        project: root,
        runId: "run_fixture",
        phase: "all",
        fact: "Use pnpm for repository package commands.",
        expectedEffect:
          "Pass the recorded package-manager constraint on validation tasks.",
        approve: true,
        reviewReason: "The exact diff is narrow and the evidence resolves.",
        budgetUsd: "1",
      },
    });
    const data = result.data as {
      readonly promotion: { readonly dryRun: boolean } | null;
      readonly selection: {
        readonly decisions: readonly { readonly decision: string }[];
      };
      readonly candidate: { readonly candidateId: string };
    };

    expect(data.selection.decisions[0]?.decision).toBe("promote-eligible");
    expect(data.promotion).toMatchObject({ dryRun: true });
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(
      "# Existing\n",
    );
    expect(
      await readFile(
        join(
          root,
          ".patchrace",
          "candidates",
          data.candidate.candidateId,
          "teaching",
          "report.json",
        ),
        "utf8",
      ),
    ).toContain('"claimBoundary"');
  });

  it("stops at review without approval and never invokes validation", async () => {
    const root = await project();
    let called = false;
    const service = new TeachingCommandService(new FixtureDiagnosisService(), {
      evaluator: {
        async validate() {
          called = true;
          throw new Error("must not run");
        },
      },
    });

    const result = await service.execute({
      command: "teach pi",
      options: {
        project: root,
        runId: "run_fixture",
        phase: "all",
        fact: "Use pnpm for repository package commands.",
      },
    });

    expect(called).toBe(false);
    expect(result.data).toMatchObject({
      phase: "review",
      nextAction: "approve-or-reject-before-validation",
      review: {
        decision: { state: "pending" },
        controls: { activationEnabled: false },
      },
    });
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(
      "# Existing\n",
    );
  });

  it("allows diagnosis as a separate side-effect-free phase", async () => {
    const root = await project();
    const service = new TeachingCommandService(new FixtureDiagnosisService());

    const result = await service.execute({
      command: "teach pi",
      options: { project: root, runId: "run_fixture", phase: "diagnose" },
    });

    expect(result).toMatchObject({
      status: "completed",
      sideEffects: [],
      data: { phase: "diagnose" },
    });
  });
});
