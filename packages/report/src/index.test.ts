import { describe, expect, it } from "vitest";

import type {
  ComparisonReportV1,
  RaceExecutionV1,
  RaceTrialResultV1,
  RankedComparisonV1,
} from "@patchrace/contracts";

import {
  buildComparisonReport,
  buildShareableComparisonReport,
  renderStaticHtml,
} from "./index.js";

function fixtures(): {
  readonly execution: RaceExecutionV1;
  readonly ranking: RankedComparisonV1;
} {
  const hash = `sha256:${"a".repeat(64)}` as const;
  const variant = {
    variantId: "pi-main",
    variantHash: hash,
    adapter: { id: "pi", kind: "pi", executable: "pi", version: null },
    model: null,
    harness: {},
    workflow: {},
    environmentNames: [],
  } as const;
  const aggregate = {
    variantId: variant.variantId,
    variantHash: hash,
    trialCount: 0,
    completedCount: 0,
    validCount: 0,
    passedCount: 0,
    failedCount: 0,
    hardGatePassRate: null,
    allHardGatesPassed: false,
    raw: {
      stabilityVariance: {
        value: null,
        unit: "ratio²",
        availability: "unavailable",
        source: "ranking",
      },
      meanCostUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "adapter",
      },
      meanLatencyMs: {
        value: null,
        unit: "ms",
        availability: "unavailable",
        source: "controller",
      },
      meanFootprintLines: {
        value: null,
        unit: "lines",
        availability: "unavailable",
        source: "patch",
      },
    },
    caveats: ["small_repeated_sample"],
  } as const;
  return {
    execution: {
      schemaVersion: "1.0.0",
      plan: {
        schemaVersion: "1.0.0",
        planHash: hash,
        comparisonDimensions: ["model", "harness", "workflow"],
        tasks: [
          {
            taskId: "task",
            taskHash: hash,
            baselineCommit: "b".repeat(40),
            instructionHash: hash,
          },
        ],
        variants: [variant],
        repeat: 1,
        budgets: { maxTrials: 1 },
        trials: [],
      },
      status: "completed",
      trials: [],
      scheduler: [],
    },
    ranking: {
      schemaVersion: "1.0.0",
      policy: {
        schemaVersion: "1.0.0",
        id: "correctness-first-v1",
        first: "hard-gates",
        afterHardGates: ["stability"],
      },
      variants: [
        {
          rank: 1,
          variantId: variant.variantId,
          variantHash: hash,
          aggregate,
          decisiveDimension: "tie",
        },
      ],
      caveats: ["missing_metrics_never_equal_zero"],
    },
  };
}

describe("static comparison report", () => {
  it("builds a stable evidence-derived model with a bounded claim", () => {
    const report = buildComparisonReport(fixtures());
    expect(report.overview.claimBoundary).toContain(
      "does not establish a universally best Agent",
    );
    expect(report.caveats).toContain("missing_metrics_never_equal_zero");
  });

  it("escapes active content and ships no script or remote resource", () => {
    const base = buildComparisonReport(fixtures());
    const report: ComparisonReportV1 = {
      ...base,
      overview: { ...base.overview, title: '<img src=x onerror="alert(1)">' },
      caveats: [...base.caveats, "</script><script>alert(1)</script>"],
    };
    const html = renderStaticHtml(report);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/https?:\/\//);
    expect(renderStaticHtml(report)).toBe(html);
  });

  it("builds a shareable projection without code, paths, trace details, or executable configuration", () => {
    const base = buildComparisonReport(fixtures());
    const hash = `sha256:${"a".repeat(64)}` as const;
    const trialId =
      "trial_00000000000000000000000000" as RaceTrialResultV1["trialId"];
    const trial: RaceTrialResultV1 = {
      schemaVersion: "1.0.0",
      trialId,
      taskId: "task",
      taskHash: hash,
      baselineCommit: "b".repeat(40),
      variantId: "pi-main",
      variantHash: hash,
      repetition: 1,
      attempt: 1,
      supersedesTrialId: null,
      terminalStatus: "completed",
      integrity: "valid",
      outcome: "passed",
      hardGates: [
        {
          id: "tests",
          status: "passed",
          evidence: ["private/customer.ts"],
        },
      ],
      metrics: {
        durationMs: {
          value: 1,
          unit: "ms",
          availability: "observed",
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
          availability: "observed",
          source: "patch",
        },
      },
      artifacts: {
        patch: "private/patch.diff",
        grade: "private/grade.json",
        trace: "private/trace.jsonl",
        result: "private/result.json",
      },
      limitations: ["customerSecret is private"],
    };
    const report: ComparisonReportV1 = {
      ...base,
      source: {
        ...base.source,
        variants: base.source.variants.map((variant) => ({
          ...variant,
          adapter: {
            ...variant.adapter,
            executable: "/private/bin/pi",
          },
          harness: { root: "private/customer.ts" },
          workflow: { prompt: "customerSecret" },
          environmentNames: ["CUSTOMER_SECRET"],
        })),
      },
      trials: [trial],
      patches: [
        {
          schemaVersion: "1.0.0",
          trialId,
          changedFiles: [
            {
              path: "private/customer.ts",
              status: "modified",
              protectedPathViolation: false,
            },
          ],
          unifiedDiff: "+const customerSecret = 'private';",
          sideBySide: [],
          reference: {
            availability: "withheld",
            unifiedDiff: null,
            reason: "private",
          },
          truncated: false,
        },
      ],
    };
    const projected = buildShareableComparisonReport(report);
    expect(projected.patches).toEqual([]);
    expect(projected.timelines).toEqual([]);
    expect(projected.trials[0]?.artifacts).toEqual({
      patch: null,
      grade: null,
      trace: null,
      result: null,
    });
    expect(projected.trials[0]?.hardGates[0]?.evidence).toEqual([]);
    expect(projected.source.variants[0]).toMatchObject({
      adapter: { executable: "[REDACTED:executable]" },
      harness: {},
      workflow: {},
      environmentNames: [],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("customerSecret");
    expect(serialized).not.toContain("private/customer.ts");
    expect(projected.caveats).toContain(
      "shareable_export_omits_local_sensitive_evidence",
    );
  });
});
