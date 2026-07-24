import { describe, expect, it } from "vitest";
import type {
  DiagnosisArtifactEvidenceV1,
  DiagnosisFindingV1,
  DiagnosisReportCaseV1,
  TrialId,
} from "@patchrace/contracts";

import { buildDiagnosisReport } from "./report.js";

const trialId = "trial_01J000000000000000000000001" as TrialId;
const hash = `sha256:${"a".repeat(64)}` as const;
const runId = "run_01J000000000000000000000001";
const tracePath = `trials/${trialId}/trace.jsonl`;
const citation = {
  runId,
  trialId,
  artifactHash: hash,
  logicalPath: tracePath,
  eventIds: ["e1"],
} as const;
const finding: DiagnosisFindingV1 = {
  schemaVersion: "1.0.0",
  id: "diag-1",
  category: "workflow",
  confidence: "high",
  claim: "A deterministic workflow issue was observed.",
  evidence: [citation],
  alternatives: [{ claim: "A transient condition may apply." }],
  eligibleMutationTargets: ["skill"],
  limitations: [],
  origin: "deterministic-rule",
  ruleId: "fixture",
};
const caseValue: DiagnosisReportCaseV1 = {
  taskId: "task",
  trialId,
  variantId: "pi",
  identity: {
    taskHash: hash,
    adapterId: "pi",
    model: "fixture",
    harnessHash: hash,
    workflowHash: hash,
  },
  deterministic: {
    schemaVersion: "1.0.0",
    diagnosisSchemaVersion: "1.0.0",
    trialId,
    deterministicFacts: {
      integrity: "valid",
      outcome: "failed",
      hardGates: [{ id: "test", status: "failed" }],
    },
    findings: [finding],
    limitations: [],
  },
  features: {
    schemaVersion: "1.0.0",
    featureSchemaVersion: "1.0.0",
    trialId,
    trace: citation,
    traceCompleteness: "complete",
    fileCoverage: {
      value: null,
      availability: "unavailable",
      evidenceEventIds: [],
      reason: "not declared",
    },
    searchLoops: {
      value: [],
      availability: "derived",
      evidenceEventIds: [],
      reason: null,
    },
    commandFailures: {
      value: { count: 0, eventIds: [] },
      availability: "derived",
      evidenceEventIds: [],
      reason: null,
    },
    timeToFirstTestMs: {
      value: 1,
      availability: "derived",
      evidenceEventIds: ["e1"],
      reason: null,
    },
    testOrder: {
      value: [],
      availability: "derived",
      evidenceEventIds: [],
      reason: null,
    },
    editFootprint: {
      value: { paths: [], changedLines: 0, eventIds: [] },
      availability: "derived",
      evidenceEventIds: [],
      reason: null,
    },
    retries: {
      value: [],
      availability: "derived",
      evidenceEventIds: [],
      reason: null,
    },
    limitations: [],
  },
  alignment: null,
  findings: [finding],
  classification: {
    schemaVersion: "1.0.0",
    classificationSchemaVersion: "1.0.0",
    trialId,
    classification: "workflow-or-configuration-gap",
    confidence: "high",
    recommendation: "consider-project-workflow-mutation",
    eligibleMutationTargets: ["skill"],
    sourceFindingIds: ["diag-1"],
    evidence: [citation],
    reasons: ["fixture"],
    limitations: [],
  },
  reflection: null,
};
const artifacts: readonly DiagnosisArtifactEvidenceV1[] = [
  {
    trialId,
    logicalPath: tracePath,
    hash,
    eventIds: ["e1"],
    gradeGateIds: [],
  },
];

describe("evidence-linked diagnosis report", () => {
  it("builds a deterministic bounded report with resolvable evidence", () => {
    const report = buildDiagnosisReport({
      runId,
      planHash: hash,
      focusVariantId: "pi",
      cases: [caseValue],
      artifacts,
    });
    expect(report.overview).toMatchObject({
      caseCount: 1,
      findingCount: 1,
      focusVariantId: "pi",
    });
    expect(report.caveats).toContain(
      "diagnosis_uses_observable_evidence_not_hidden_reasoning",
    );
  });

  it("fails closed on dangling event citations", () => {
    expect(() =>
      buildDiagnosisReport({
        runId,
        planHash: hash,
        focusVariantId: "pi",
        cases: [
          {
            ...caseValue,
            findings: [
              {
                ...finding,
                evidence: [{ ...citation, eventIds: ["missing"] }],
              },
            ],
          },
        ],
        artifacts,
      }),
    ).toThrow(/outside the artifact inventory/);
  });
});
