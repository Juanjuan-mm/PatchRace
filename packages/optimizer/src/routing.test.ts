import { describe, expect, it } from "vitest";

import {
  type DiagnosisFindingV1,
  type EvidenceCitationV1,
  type GapClassificationV1,
  type RuleDiagnosisV1,
} from "@patchrace/contracts";

import { routeDiagnosisToMutation } from "./routing.js";

const citation: EvidenceCitationV1 = {
  runId: "run_01K0FAKE000000000000000000",
  trialId: "trial_01K0FAKE000000000000000000",
  artifactHash: `sha256:${"1".repeat(64)}`,
  logicalPath: "trials/focus/grade.json",
  gradeGateIds: ["constraint:required"],
};

function finding(
  category: DiagnosisFindingV1["category"],
  targets: DiagnosisFindingV1["eligibleMutationTargets"],
): DiagnosisFindingV1 {
  return {
    schemaVersion: "1.0.0",
    id: `diag_${category}`,
    category,
    confidence: "high",
    claim: `${category} finding`,
    evidence: [citation],
    alternatives: [{ claim: "alternative" }],
    eligibleMutationTargets: targets,
    limitations: [],
    origin: "deterministic-rule",
    ruleId: `rule-${category}`,
  };
}

function diagnosis(value: DiagnosisFindingV1): RuleDiagnosisV1 {
  return {
    schemaVersion: "1.0.0",
    diagnosisSchemaVersion: "1.0.0",
    trialId: citation.trialId,
    deterministicFacts: {
      integrity: "valid",
      outcome: "failed",
      hardGates: [{ id: "constraint:required", status: "failed" }],
    },
    findings: [value],
    limitations: [],
  };
}

function classification(
  value: DiagnosisFindingV1,
  kind: GapClassificationV1["classification"] = "workflow-or-configuration-gap",
): GapClassificationV1 {
  return {
    schemaVersion: "1.0.0",
    classificationSchemaVersion: "1.0.0",
    trialId: citation.trialId,
    classification: kind,
    confidence: kind === "likely-model-capability-gap" ? "medium" : "high",
    recommendation:
      kind === "workflow-or-configuration-gap"
        ? "consider-project-workflow-mutation"
        : "no-configuration-mutation",
    eligibleMutationTargets:
      kind === "workflow-or-configuration-gap"
        ? value.eligibleMutationTargets
        : [],
    sourceFindingIds: [value.id],
    evidence: [citation],
    reasons: [],
    limitations: [],
  };
}

describe("diagnosis-to-mutation routing", () => {
  it("routes stable facts to guidance and repeatable procedures to skills", () => {
    const context = finding("context", ["agents-guidance"]);
    const workflow = finding("workflow", ["skill", "prompt-template"]);

    expect(
      routeDiagnosisToMutation({
        deterministic: diagnosis(context),
        classification: classification(context),
      })[0],
    ).toMatchObject({
      disposition: "candidate",
      mutationType: "agents-guidance",
    });
    expect(
      routeDiagnosisToMutation({
        deterministic: diagnosis(workflow),
        classification: classification(workflow),
      })[0],
    ).toMatchObject({ disposition: "candidate", mutationType: "skill" });
  });

  it("uses prompts only for an explicitly evidenced invocation", () => {
    const workflow = finding("verification", ["skill", "prompt-template"]);

    const result = routeDiagnosisToMutation({
      deterministic: diagnosis(workflow),
      classification: classification(workflow),
      invokedWorkflow: { name: "release-check", evidence: [citation] },
    });

    expect(result[0]).toMatchObject({
      disposition: "candidate",
      mutationType: "prompt-template",
      invokedWorkflow: "release-check",
    });
  });

  it("keeps tool and capability outcomes informational", () => {
    const tool = finding("tool", ["settings"]);
    const unknown = finding("unknown", []);

    expect(
      routeDiagnosisToMutation({
        deterministic: diagnosis(tool),
        classification: classification(tool),
      })[0],
    ).toMatchObject({
      disposition: "recommendation",
      recommendationKind: "manual-tool",
      mutationType: null,
    });
    expect(
      routeDiagnosisToMutation({
        deterministic: diagnosis(unknown),
        classification: classification(unknown, "likely-model-capability-gap"),
      })[0],
    ).toMatchObject({
      disposition: "recommendation",
      recommendationKind: "model-advice",
      mutationType: null,
    });
  });

  it("does not grant mutation authority to insufficient or invalid evidence", () => {
    const workflow = finding("workflow", ["skill"]);
    const invalid = diagnosis(workflow);
    const invalidDiagnosis: RuleDiagnosisV1 = {
      ...invalid,
      deterministicFacts: {
        ...invalid.deterministicFacts,
        integrity: "unknown",
      },
    };

    expect(
      routeDiagnosisToMutation({
        deterministic: invalidDiagnosis,
        classification: classification(workflow),
      })[0],
    ).toMatchObject({ disposition: "no-candidate", mutationType: null });
    expect(
      routeDiagnosisToMutation({
        deterministic: diagnosis(workflow),
        classification: classification(workflow, "insufficient-evidence"),
      })[0],
    ).toMatchObject({ disposition: "no-candidate", mutationType: null });
  });
});
