import { describe, expect, it } from "vitest";
import type { DiagnosisReportV1 } from "@patchrace/contracts";

import {
  renderDiagnosisReportJson,
  renderDiagnosisStaticHtml,
} from "./diagnosis.js";

describe("diagnosis report presenters", () => {
  it("renders canonical JSON and inert escaped HTML", () => {
    const hash = `sha256:${"a".repeat(64)}` as const;
    const report = {
      schemaVersion: "1.0.0",
      reportSchemaVersion: "1.0.0",
      source: {
        runId: "run_01J000000000000000000000001",
        planHash: hash,
        artifacts: [],
      },
      overview: {
        title: "<img src=x onerror=alert(1)>",
        focusVariantId: "pi",
        caseCount: 0,
        findingCount: 0,
        claimBoundary: "</script><script>alert(1)</script>",
      },
      cases: [],
      caveats: ["observable only"],
    } satisfies DiagnosisReportV1;
    const html = renderDiagnosisStaticHtml(report);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain("default-src 'none'");
    expect(renderDiagnosisReportJson(report)).toBe(
      renderDiagnosisReportJson(report),
    );
  });

  it("renders non-empty evidence, alternatives, and limitations as inert text", () => {
    const hash = `sha256:${"b".repeat(64)}` as const;
    const trialId = "trial_01J000000000000000000000001" as const;
    const citation = {
      runId: "run_01J000000000000000000000001",
      trialId,
      artifactHash: hash,
      logicalPath: "<img src=x onerror=alert(1)>",
      eventIds: ["event<script>"],
      gradeGateIds: ["gate&one"],
    } as const;
    const finding = {
      schemaVersion: "1.0.0",
      id: "finding-1",
      category: "workflow",
      confidence: "high",
      claim: "Use <script>alert(1)</script> as inert evidence.",
      evidence: [citation],
      alternatives: [{ claim: "Alternative & explanation" }],
      eligibleMutationTargets: ["skill"],
      limitations: ["Not universally transferable > one repository."],
      origin: "deterministic-rule",
      ruleId: "fixture-rule",
    } as const;
    const report: DiagnosisReportV1 = {
      schemaVersion: "1.0.0",
      reportSchemaVersion: "1.0.0",
      source: {
        runId: citation.runId,
        planHash: hash,
        artifacts: [
          {
            trialId,
            logicalPath: citation.logicalPath,
            hash,
            eventIds: [...citation.eventIds],
            gradeGateIds: [...citation.gradeGateIds],
          },
        ],
      },
      overview: {
        title: "Diagnosis <fixture>",
        focusVariantId: "pi&candidate",
        caseCount: 1,
        findingCount: 1,
        claimBoundary: "Observable evidence only.",
      },
      cases: [
        {
          taskId: "task<script>",
          trialId,
          variantId: "pi&candidate",
          identity: {
            taskHash: hash,
            adapterId: "pi",
            model: null,
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
              value: { count: 1, eventIds: ["event<script>"] },
              availability: "derived",
              evidenceEventIds: ["event<script>"],
              reason: null,
            },
            timeToFirstTestMs: {
              value: 1,
              availability: "derived",
              evidenceEventIds: ["event<script>"],
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
            sourceFindingIds: [finding.id],
            evidence: [citation],
            reasons: ["fixture"],
            limitations: [],
          },
          reflection: null,
        },
      ],
      caveats: ["Review <all> exported evidence."],
    };

    const html = renderDiagnosisStaticHtml(report);
    expect(html).toContain("task&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("event&lt;script&gt;");
    expect(html).toContain("gate&amp;one");
    expect(html).toContain("Alternative &amp; explanation");
    expect(html).toContain("Not universally transferable &gt; one repository.");
    expect(html).not.toContain("<script>");
    expect(renderDiagnosisReportJson(report)).toContain(
      '"classification":"workflow-or-configuration-gap"',
    );
  });
});
