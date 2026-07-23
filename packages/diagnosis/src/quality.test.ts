import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import type {
  DiagnosisCategory,
  LabeledDiagnosisCaseV1,
  RaceTrialResultV1,
  TraceEventV1,
  TrialId,
} from "@patchrace/contracts";

import { extractTrajectoryFeatures } from "./features.js";
import { evaluateDiagnosisQuality } from "./quality.js";
import { diagnoseWithRules } from "./rules.js";

const hash = `sha256:${"a".repeat(64)}` as const;

interface FixtureCase {
  readonly id: string;
  readonly expectedCategory: DiagnosisCategory;
  readonly scenario:
    | "discovery"
    | "context"
    | "workflow"
    | "tool"
    | "verification"
    | "capability"
    | "unknown";
  readonly variant: number;
}

function event(
  trialId: TrialId,
  sequence: number,
  type: string,
  data: TraceEventV1["data"],
): TraceEventV1 {
  return {
    schemaVersion: "1.0.0",
    eventId: `e${sequence}`,
    sequence,
    trialId,
    type,
    time: { wall: null, monotonicMs: sequence * 10, precision: "millisecond" },
    actor: "tool",
    source: { adapter: "pi", adapterVersion: "fixture" },
    availability: "observed",
    data,
    sensitivity: [],
  };
}

function scenario(
  item: FixtureCase,
  trialId: TrialId,
): {
  readonly events: readonly TraceEventV1[];
  readonly relevantPaths?: readonly string[];
  readonly testLaneObserved?: boolean;
  readonly result: Partial<RaceTrialResultV1>;
} {
  const paths = [
    ["src/add.ts", "test/add.test.ts"],
    ["pkg/add.py", "tests/test_add.py"],
    ["src/lib.rs", "tests/add.rs"],
  ][item.variant]!;
  if (item.scenario === "discovery")
    return {
      relevantPaths: paths,
      events: [
        event(trialId, 1, "file.read.completed", { path: paths[0]! }),
        event(trialId, 2, "search.completed", {
          query: ["add", "def add", "fn add"][item.variant]!,
          scope: item.variant === 0 ? "src" : ".",
        }),
        event(trialId, 3, "search.completed", {
          query: ["add", "def add", "fn add"][item.variant]!,
          scope: item.variant === 0 ? "src" : ".",
        }),
        event(trialId, 4, "test.completed", { exitCode: 0 }),
      ],
      testLaneObserved: true,
      result: {
        hardGates: [
          { id: "functional", status: "failed", evidence: ["grade.json"] },
        ],
      },
    };
  if (item.scenario === "context") {
    const gateIds = ["constraint:api", "instruction:compat", "protected:path"];
    return {
      events: [event(trialId, 1, "test.completed", { exitCode: 0 })],
      testLaneObserved: true,
      result: {
        hardGates: [
          {
            id: gateIds[item.variant]!,
            status: "failed",
            evidence: ["grade.json"],
          },
        ],
      },
    };
  }
  if (item.scenario === "workflow") {
    const commands = [
      ["pnpm", "test"],
      ["pytest", "-q"],
      ["cargo", "check"],
    ];
    return {
      events: [
        event(trialId, 1, "command.completed", {
          argv: commands[item.variant]!,
          exitCode: 1,
        }),
        event(trialId, 2, "command.completed", {
          argv: commands[item.variant]!,
          exitCode: 1,
        }),
        event(trialId, 3, "test.completed", { exitCode: 0 }),
      ],
      testLaneObserved: true,
      result: {
        hardGates: [
          { id: "functional", status: "failed", evidence: ["grade.json"] },
        ],
      },
    };
  }
  if (item.scenario === "tool") {
    const errors = [
      ["SPAWN_FAILED", "spawn"],
      ["PARSER_INVALID_JSON", "parser"],
      ["EXECUTABLE_MISSING", "tool"],
    ];
    return {
      events: [
        event(trialId, 1, "error.observed", {
          code: errors[item.variant]![0]!,
          category: errors[item.variant]![1]!,
        }),
      ],
      result: {
        hardGates: [
          { id: "functional", status: "failed", evidence: ["grade.json"] },
        ],
      },
    };
  }
  if (item.scenario === "verification")
    return item.variant === 1
      ? {
          events: [event(trialId, 1, "edit.completed", { path: paths[0]! })],
          testLaneObserved: true,
          result: {
            hardGates: [
              { id: "test", status: "failed", evidence: ["grade.json"] },
            ],
          },
        }
      : {
          events: [
            event(
              trialId,
              1,
              item.variant === 0 ? "test.failed" : "test.completed",
              { exitCode: item.variant === 0 ? 1 : 0 },
            ),
            event(trialId, 2, "edit.completed", { path: paths[0]! }),
          ],
          testLaneObserved: true,
          result: {
            hardGates: [
              { id: "test", status: "failed", evidence: ["grade.json"] },
            ],
          },
        };
  if (item.scenario === "capability")
    return {
      relevantPaths: paths,
      events: [
        event(trialId, 1, "file.read.completed", { path: paths[0]! }),
        event(trialId, 2, "file.read.completed", { path: paths[1]! }),
        event(trialId, 3, "test.completed", { exitCode: 0 }),
      ],
      testLaneObserved: true,
      result: {
        hardGates: [
          { id: "functional", status: "failed", evidence: ["grade.json"] },
        ],
      },
    };
  return {
    events: [event(trialId, 1, "trial.failed", {})],
    result:
      item.variant === 0
        ? { integrity: "unknown", outcome: "unavailable" }
        : item.variant === 1
          ? { integrity: "compromised", outcome: "failed" }
          : {
              outcome: "unavailable",
              hardGates: [
                { id: "test", status: "error", evidence: ["grade.json"] },
              ],
            },
  };
}

function baseResult(trialId: TrialId): RaceTrialResultV1 {
  return {
    schemaVersion: "1.0.0",
    trialId,
    taskId: "fixture",
    taskHash: hash,
    baselineCommit: "1".repeat(40),
    variantId: "pi",
    variantHash: hash,
    repetition: 1,
    attempt: 1,
    supersedesTrialId: null,
    terminalStatus: "completed",
    integrity: "valid",
    outcome: "failed",
    hardGates: [
      { id: "functional", status: "failed", evidence: ["grade.json"] },
    ],
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
  };
}

async function labeledCases(): Promise<readonly LabeledDiagnosisCaseV1[]> {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        "../../../fixtures/diagnosis/labeled-cases.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { cases: FixtureCase[] };
  return fixture.cases.map((item, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const trialId = `trial_01J0000000000000000000000${suffix}` as TrialId;
    const input = scenario(item, trialId);
    const result = { ...baseResult(trialId), ...input.result };
    const features = extractTrajectoryFeatures({
      runId: "run_01J000000000000000000000001",
      artifactHash: hash,
      logicalPath: `${item.id}/trace.jsonl`,
      events: input.events,
      ...(input.relevantPaths === undefined
        ? {}
        : { relevantPaths: input.relevantPaths }),
      traceCompleteness: "complete",
      lanes: {
        file: { availability: "observed" },
        search: { availability: "observed" },
        command: { availability: "observed" },
        edit: { availability: "observed" },
        ...(input.testLaneObserved === true
          ? { test: { availability: "observed" as const } }
          : {}),
      },
    });
    return {
      id: item.id,
      expectedCategory: item.expectedCategory,
      findings: diagnoseWithRules({
        features,
        events: input.events,
        result,
        grade: {
          runId: "run_01J000000000000000000000001",
          artifactHash: hash,
          logicalPath: `${item.id}/grade.json`,
        },
      }).findings,
    };
  });
}

describe("maintainer-labeled diagnosis quality", () => {
  it("meets the frozen precision gate across all seven categories", async () => {
    const cases = await labeledCases();
    const report = evaluateDiagnosisQuality(cases);
    expect(report.totals.labeledCases).toBe(21);
    expect(report.categories.every((category) => category.support >= 3)).toBe(
      true,
    );
    expect(report.highConfidencePrecision).toBeGreaterThanOrEqual(0.8);
    expect(report.falsePositives).toEqual([]);
    expect(report.unsafeOrSpeculative).toEqual([]);
    expect(report.unclassifiedCaseIds).toEqual([
      "capability-adequate-js-trajectory",
      "capability-adequate-python-trajectory",
      "capability-adequate-rust-trajectory",
    ]);
    expect(report.passed).toBe(true);
  });

  it("identifies unsafe speculative authority and fails the gate", () => {
    const unsafe = {
      schemaVersion: "1.0.0",
      id: "unsafe",
      category: "capability",
      confidence: "high",
      claim: "Universal capability failure.",
      evidence: [],
      alternatives: [],
      eligibleMutationTargets: ["settings"],
      limitations: [],
      origin: "reflection",
      ruleId: null,
    } as const;
    const report = evaluateDiagnosisQuality(
      Array.from({ length: 20 }, (_, index) => ({
        id: `case-${index}`,
        expectedCategory: FAILURE_LABELS[index % FAILURE_LABELS.length]!,
        findings: [unsafe],
      })),
    );
    expect(report.unsafeOrSpeculative[0]?.reasons).toEqual(
      expect.arrayContaining([
        "missing_evidence",
        "missing_alternative",
        "reflection_confidence_elevated",
        "reflection_mutation_authority",
        "non_actionable_category_has_mutation_target",
        "capability_claim_overconfident",
      ]),
    );
    expect(report.passed).toBe(false);
  });
});

const FAILURE_LABELS = [
  "discovery",
  "context",
  "workflow",
  "tool",
  "verification",
  "capability",
  "unknown",
] as const;
