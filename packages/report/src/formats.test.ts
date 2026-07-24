import { describe, expect, it } from "vitest";
import type { ComparisonReportV1, TrialId } from "@patchrace/contracts";
import {
  renderJUnitXml,
  renderReportJson,
  renderSarifJson,
} from "./formats.js";

const hash = `sha256:${"a".repeat(64)}` as const;
const report: ComparisonReportV1 = {
  schemaVersion: "1.0.0",
  reportSchemaVersion: "1.0.0",
  source: {
    planHash: hash,
    executionStatus: "completed",
    taskSnapshots: [],
    variants: [],
  },
  overview: {
    title: "A < B",
    taskCount: 1,
    variantCount: 1,
    plannedTrialCount: 1,
    completedEvidenceCount: 1,
    claimBoundary: "bounded",
  },
  ranking: {
    schemaVersion: "1.0.0",
    policy: {
      schemaVersion: "1.0.0",
      id: "correctness-first-v1",
      first: "hard-gates",
      afterHardGates: [],
    },
    variants: [],
    caveats: [],
  },
  trials: [
    {
      schemaVersion: "1.0.0",
      trialId: "trial_01J000000000000000000000001" as TrialId,
      taskId: "task<&",
      taskHash: hash,
      baselineCommit: "b".repeat(40),
      variantId: "pi",
      variantHash: hash,
      repetition: 1,
      attempt: 1,
      supersedesTrialId: null,
      terminalStatus: "completed",
      integrity: "valid",
      outcome: "failed",
      hardGates: [{ id: "tests", status: "failed", evidence: ["grade.json"] }],
      metrics: {
        durationMs: {
          value: 100,
          unit: "ms",
          availability: "derived",
          source: "controller",
        },
        costUsd: {
          value: null,
          unit: "USD",
          availability: "unavailable",
          source: "adapter",
        },
        tokens: {
          value: null,
          unit: "tokens",
          availability: "unavailable",
          source: "adapter",
        },
        footprintLines: {
          value: 1,
          unit: "lines",
          availability: "derived",
          source: "patch",
        },
      },
      artifacts: {
        patch: null,
        grade: "grade.json",
        trace: null,
        result: null,
      },
      limitations: [],
    },
  ],
  patches: [],
  timelines: [],
  caveats: [],
};

describe("machine report formats", () => {
  it("emits deterministic canonical JSON", () =>
    expect(renderReportJson(report)).toBe(renderReportJson(report)));
  it("emits escaped JUnit failures", () => {
    const output = renderJUnitXml(report);
    expect(output).toContain('failures="1"');
    expect(output).toContain("task&lt;&amp;");
    expect(output).not.toContain("task<&");
  });
  it("emits SARIF 2.1.0 hard-gate findings", () => {
    const sarif = JSON.parse(renderSarifJson(report)) as {
      version: string;
      runs: { results: { ruleId: string }[] }[];
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.results[0]?.ruleId).toBe("patchrace.gate.tests");
  });
});
