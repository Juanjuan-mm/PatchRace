import { describe, expect, it } from "vitest";
import type {
  RaceTrialResultV1,
  TraceEventV1,
  TrialId,
} from "@patchrace/contracts";

import { extractTrajectoryFeatures } from "./features.js";
import { diagnoseWithRules } from "./rules.js";

const trialId = "trial_01J000000000000000000000001" as TrialId;
const artifactHash = `sha256:${"a".repeat(64)}` as const;

function event(
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
    source: { adapter: "pi", adapterVersion: "1" },
    availability: "observed",
    data,
    sensitivity: [],
  };
}

function result(overrides: Partial<RaceTrialResultV1> = {}): RaceTrialResultV1 {
  return {
    schemaVersion: "1.0.0",
    trialId,
    taskId: "task",
    taskHash: artifactHash,
    baselineCommit: "1".repeat(40),
    variantId: "pi",
    variantHash: artifactHash,
    repetition: 1,
    attempt: 1,
    supersedesTrialId: null,
    terminalStatus: "completed",
    integrity: "valid",
    outcome: "failed",
    hardGates: [{ id: "test", status: "failed", evidence: ["grade.json"] }],
    metrics: {
      durationMs: {
        value: 1,
        unit: "ms",
        availability: "observed",
        source: "trial",
      },
      costUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "trial",
      },
      tokens: {
        value: null,
        unit: "tokens",
        availability: "unavailable",
        source: "trial",
      },
      footprintLines: {
        value: 1,
        unit: "lines",
        availability: "derived",
        source: "patch",
      },
    },
    artifacts: {
      patch: "patch.diff",
      grade: "grade.json",
      trace: "trace.jsonl",
      result: "result.json",
    },
    limitations: [],
    ...overrides,
  };
}

function diagnose(
  events: readonly TraceEventV1[],
  resultValue: RaceTrialResultV1 = result(),
) {
  const features = extractTrajectoryFeatures({
    runId: "run_01J000000000000000000000001",
    artifactHash,
    logicalPath: "trace.jsonl",
    relevantPaths: ["src/a.ts", "test/a.test.ts"],
    traceCompleteness: "complete",
    lanes: {
      file: { availability: "observed" },
      search: { availability: "observed" },
      command: { availability: "observed" },
      edit: { availability: "observed" },
      test: { availability: "observed" },
    },
    events,
  });
  return diagnoseWithRules({
    features,
    events,
    result: resultValue,
    grade: {
      runId: "run_01J000000000000000000000001",
      artifactHash,
      logicalPath: "grade.json",
    },
  });
}

describe("rule-based failure diagnosis", () => {
  it("cites exact events and gates for discovery, workflow, and stale verification", () => {
    const diagnosis = diagnose([
      event(1, "file.read.completed", { path: "src/a.ts" }),
      event(2, "search.completed", { query: "x", scope: "src" }),
      event(3, "search.completed", { query: "x", scope: "src" }),
      event(4, "command.completed", { argv: ["pnpm", "test"], exitCode: 1 }),
      event(5, "command.completed", { argv: ["pnpm", "test"], exitCode: 1 }),
      event(6, "test.failed", { exitCode: 1 }),
      event(7, "edit.completed", { path: "src/a.ts", changedLines: 1 }),
    ]);
    expect(diagnosis.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(["discovery", "workflow", "verification"]),
    );
    for (const finding of diagnosis.findings) {
      expect(finding.origin).toBe("deterministic-rule");
      expect(finding.confidence).toBe("high");
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.alternatives.length).toBeGreaterThan(0);
    }
  });

  it("maps explicit tool errors and constraint gates without overriding facts", () => {
    const diagnosis = diagnose(
      [
        event(1, "error.observed", {
          code: "SPAWN_FAILED",
          category: "tool",
        }),
      ],
      result({
        hardGates: [
          { id: "protected:path", status: "failed", evidence: ["grade.json"] },
        ],
      }),
    );
    expect(diagnosis.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(["tool", "context"]),
    );
    expect(diagnosis.deterministicFacts.hardGates).toEqual([
      { id: "protected:path", status: "failed" },
    ]);
  });

  it("suppresses narrow blame when integrity is not valid", () => {
    const diagnosis = diagnose(
      [event(1, "edit.completed", { path: "src/a.ts" })],
      result({ integrity: "unknown", outcome: "unavailable" }),
    );
    expect(diagnosis.findings).toHaveLength(1);
    expect(diagnosis.findings[0]).toMatchObject({
      category: "unknown",
      confidence: "high",
      eligibleMutationTargets: [],
    });
    expect(diagnosis.limitations).toContain(
      "narrow_rules_suppressed_by_invalid_or_unavailable_evidence",
    );
  });

  it("returns low-confidence unknown when no high-confidence rule matches", () => {
    const diagnosis = diagnose([
      event(1, "file.read.completed", { path: "src/a.ts" }),
      event(2, "file.read.completed", { path: "test/a.test.ts" }),
      event(3, "test.completed", { exitCode: 0 }),
    ]);
    expect(diagnosis.findings).toHaveLength(1);
    expect(diagnosis.findings[0]).toMatchObject({
      category: "unknown",
      confidence: "low",
      ruleId: "insufficient-deterministic-evidence-v1",
    });
  });
});
