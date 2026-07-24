import { describe, expect, it } from "vitest";
import type {
  DiagnosisFindingV1,
  GapVariantIdentityV1,
  RaceTrialResultV1,
  RuleDiagnosisV1,
  TrialId,
} from "@patchrace/contracts";

import { classifyWorkflowOrCapability } from "./classifier.js";

const trialId = "trial_01J000000000000000000000001" as TrialId;
const hash = `sha256:${"a".repeat(64)}` as const;
const otherHash = `sha256:${"b".repeat(64)}` as const;
const identity: GapVariantIdentityV1 = {
  taskHash: hash,
  adapterId: "pi",
  model: "model-a",
  harnessHash: hash,
  workflowHash: hash,
};

function finding(
  category: DiagnosisFindingV1["category"],
  confidence: DiagnosisFindingV1["confidence"],
  actionable = false,
): DiagnosisFindingV1 {
  return {
    schemaVersion: "1.0.0",
    id: `finding-${category}`,
    category,
    confidence,
    claim: "fixture",
    evidence: [
      {
        runId: "run_01J000000000000000000000001",
        trialId,
        artifactHash: hash,
        logicalPath: "trace.jsonl",
        eventIds: ["e1"],
      },
    ],
    alternatives: [{ claim: "alternative" }],
    eligibleMutationTargets: actionable ? ["skill"] : [],
    limitations: [],
    origin: "deterministic-rule",
    ruleId: "fixture",
  };
}

function diagnosis(
  findings: readonly DiagnosisFindingV1[],
  limitations: readonly string[] = [],
): RuleDiagnosisV1 {
  return {
    schemaVersion: "1.0.0",
    diagnosisSchemaVersion: "1.0.0",
    trialId,
    deterministicFacts: {
      integrity: "valid",
      outcome: "failed",
      hardGates: [{ id: "test", status: "failed" }],
    },
    findings,
    limitations,
  };
}

function peer(
  model: string,
  overrides: Partial<GapVariantIdentityV1> = {},
): {
  identity: GapVariantIdentityV1;
  result: RaceTrialResultV1;
  citation: DiagnosisFindingV1["evidence"][number];
} {
  return {
    identity: { ...identity, model, ...overrides },
    result: {
      schemaVersion: "1.0.0",
      trialId:
        `trial_01J0000000000000000000000${model === "b" ? "02" : "03"}` as TrialId,
      taskId: "task",
      taskHash: hash,
      baselineCommit: "1".repeat(40),
      variantId: model,
      variantHash: hash,
      repetition: 1,
      attempt: 1,
      supersedesTrialId: null,
      terminalStatus: "completed",
      integrity: "valid",
      outcome: "passed",
      hardGates: [{ id: "test", status: "passed", evidence: ["grade.json"] }],
      metrics: {
        durationMs: {
          value: 1,
          unit: "ms",
          availability: "observed",
          source: "fixture",
        },
        costUsd: {
          value: null,
          unit: "USD",
          availability: "unavailable",
          source: "fixture",
        },
        tokens: {
          value: null,
          unit: "tokens",
          availability: "unavailable",
          source: "fixture",
        },
        footprintLines: {
          value: 1,
          unit: "lines",
          availability: "derived",
          source: "fixture",
        },
      },
      artifacts: {
        patch: "patch.diff",
        grade: "grade.json",
        trace: "trace.jsonl",
        result: "result.json",
      },
      limitations: [],
    },
    citation: {
      runId: "run_01J000000000000000000000001",
      trialId,
      artifactHash: hash,
      logicalPath: `${model}/result.json`,
    },
  };
}

describe("workflow versus capability classifier", () => {
  it("prefers high-confidence actionable deterministic workflow evidence", () => {
    const result = classifyWorkflowOrCapability({
      deterministic: diagnosis([finding("workflow", "high", true)]),
      focusIdentity: identity,
      peers: [peer("b"), peer("c")],
    });
    expect(result).toMatchObject({
      classification: "workflow-or-configuration-gap",
      confidence: "high",
      recommendation: "consider-project-workflow-mutation",
      eligibleMutationTargets: ["skill"],
    });
    expect(result.reasons).toContain(
      "narrow_deterministic_explanation_precedes_capability",
    );
  });

  it("requires repeated valid model-only peers for likely capability", () => {
    const result = classifyWorkflowOrCapability({
      deterministic: diagnosis([finding("unknown", "low")]),
      focusIdentity: identity,
      peers: [peer("b"), peer("c")],
    });
    expect(result).toMatchObject({
      classification: "likely-model-capability-gap",
      confidence: "medium",
      recommendation: "no-configuration-mutation",
      eligibleMutationTargets: [],
    });
  });

  it("returns no-mutation insufficient evidence for confounded or sparse peers", () => {
    const result = classifyWorkflowOrCapability({
      deterministic: diagnosis([finding("unknown", "low")]),
      focusIdentity: identity,
      peers: [peer("b", { workflowHash: otherHash })],
    });
    expect(result).toMatchObject({
      classification: "insufficient-evidence",
      confidence: "low",
      recommendation: "no-configuration-mutation",
      eligibleMutationTargets: [],
    });
    expect(result.reasons).toContain(
      "one_or_more_peers_confounded_or_incomparable",
    );
  });

  it("does not classify limited focus evidence as capability", () => {
    const result = classifyWorkflowOrCapability({
      deterministic: diagnosis([finding("unknown", "low")], ["trace_partial"]),
      focusIdentity: identity,
      peers: [peer("b"), peer("c")],
    });
    expect(result.classification).toBe("insufficient-evidence");
    expect(result.recommendation).toBe("no-configuration-mutation");
  });
});
