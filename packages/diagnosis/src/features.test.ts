import { describe, expect, it } from "vitest";
import type { TraceEventV1, TrialId } from "@patchrace/contracts";

import {
  diffTrajectoryFeatures,
  extractTrajectoryFeatures,
} from "./features.js";

const trialId = "trial_01J000000000000000000000001" as TrialId;
const hash = `sha256:${"1".repeat(64)}` as const;

function event(
  sequence: number,
  type: string,
  data: TraceEventV1["data"],
  monotonicMs: number | null = sequence * 10,
): TraceEventV1 {
  return {
    schemaVersion: "1.0.0",
    eventId: `e${sequence}`,
    sequence,
    trialId,
    type,
    time: { wall: null, monotonicMs, precision: "millisecond" },
    actor: "tool",
    source: { adapter: "pi", adapterVersion: "1" },
    availability: "observed",
    data,
    sensitivity: [],
  };
}

describe("deterministic trajectory features", () => {
  it("computes coverage, loops, failures, timing, order, footprint, and retries", () => {
    const features = extractTrajectoryFeatures({
      runId: "run_01J000000000000000000000001",
      artifactHash: hash,
      logicalPath: `trials/${trialId}/trace.jsonl`,
      relevantPaths: ["src/a.ts", "./test/a.test.ts"],
      traceCompleteness: "complete",
      lanes: {
        file: { availability: "observed" },
        search: { availability: "observed" },
        command: { availability: "observed" },
        edit: { availability: "observed" },
        test: { availability: "observed" },
      },
      events: [
        event(1, "trial.started", {}),
        event(2, "file.read.completed", { path: "./src/a.ts" }),
        event(3, "search.completed", { query: "add", scope: "src" }),
        event(4, "search.completed", { query: "add", scope: "src" }),
        event(5, "command.completed", {
          argv: ["pnpm", "test"],
          exitCode: 1,
        }),
        event(6, "command.completed", {
          argv: ["pnpm", "test"],
          exitCode: 1,
        }),
        event(7, "edit.completed", {
          path: "src/a.ts",
          linesAdded: 2,
          linesRemoved: 1,
        }),
        event(8, "test.completed", { exitCode: 0 }),
      ],
    });
    expect(features.fileCoverage.value).toEqual({
      relevantPathCount: 2,
      observedRelevantPaths: ["src/a.ts"],
      ratio: 0.5,
    });
    expect(features.searchLoops.value?.[0]?.repetitions).toBe(2);
    expect(features.commandFailures.value?.count).toBe(2);
    expect(features.timeToFirstTestMs.value).toBe(70);
    expect(features.testOrder.value?.[0]?.status).toBe("passed");
    expect(features.editFootprint.value).toMatchObject({
      paths: ["src/a.ts"],
      changedLines: 3,
    });
    expect(features.retries.value?.[0]?.repetitions).toBe(2);
    expect(features.trace.eventIds).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
      "e5",
      "e6",
      "e7",
      "e8",
    ]);
  });

  it("distinguishes an observed zero from an unavailable lane", () => {
    const base = {
      runId: "run_01J000000000000000000000001",
      artifactHash: hash,
      logicalPath: "trace.jsonl",
      relevantPaths: ["src/a.ts"],
      traceCompleteness: "partial" as const,
      events: [event(1, "trial.started", {})],
    };
    const unavailable = extractTrajectoryFeatures(base);
    const observed = extractTrajectoryFeatures({
      ...base,
      lanes: {
        search: { availability: "observed" as const },
        command: { availability: "observed" as const },
      },
    });
    expect(unavailable.searchLoops).toMatchObject({
      value: null,
      availability: "unavailable",
    });
    expect(observed.searchLoops).toMatchObject({
      value: [],
      availability: "derived",
    });
    expect(observed.commandFailures.value?.count).toBe(0);
  });

  it("computes right-minus-left deltas without replacing unavailable values", () => {
    const make = (events: readonly TraceEventV1[], commandObserved: boolean) =>
      extractTrajectoryFeatures({
        runId: "run_01J000000000000000000000001",
        artifactHash: hash,
        logicalPath: "trace.jsonl",
        traceCompleteness: "complete",
        events,
        lanes: commandObserved ? { command: { availability: "observed" } } : {},
      });
    const left = make(
      [event(1, "command.completed", { argv: ["x"], exitCode: 1 })],
      true,
    );
    const right = make([event(1, "trial.started", {})], false);
    const delta = diffTrajectoryFeatures(left, right);
    expect(delta.deltas.commandFailureCount).toMatchObject({
      value: null,
      availability: "unavailable",
    });
    expect(delta.convention).toBe("right-minus-left");
  });

  it("rejects mixed or non-monotonic trace evidence", () => {
    expect(() =>
      extractTrajectoryFeatures({
        runId: "run_01J000000000000000000000001",
        artifactHash: hash,
        logicalPath: "trace.jsonl",
        traceCompleteness: "complete",
        events: [
          event(2, "trial.started", {}),
          event(1, "trial.completed", {}),
        ],
      }),
    ).toThrow(/strictly increasing/);
  });
});
