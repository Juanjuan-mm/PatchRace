import { describe, expect, it } from "vitest";
import type { TraceEventV1, TrialId } from "@patchrace/contracts";
import { buildTrajectoryTimeline } from "./timeline.js";

function event(
  adapter: "pi" | "codex",
  sequence: number,
  type: string,
  data: TraceEventV1["data"],
): TraceEventV1 {
  return {
    schemaVersion: "1.0.0",
    eventId: `${adapter}-${sequence}`,
    sequence,
    trialId:
      `trial_01J0000000000000000000000${adapter === "pi" ? "01" : "02"}` as TrialId,
    type,
    time: { wall: null, monotonicMs: sequence, precision: "millisecond" },
    actor: "tool",
    source: {
      adapter,
      adapterVersion: "1",
      rawRef: { path: "raw/events.jsonl", record: sequence },
    },
    availability: "observed",
    data,
    sensitivity: [],
  };
}

describe("trajectory timeline", () => {
  it("aligns cross-vendor observable actions and labels missing lanes", () => {
    const timeline = buildTrajectoryTimeline({
      traces: [
        {
          variantId: "pi",
          events: [
            event("pi", 1, "file.read.completed", { path: "src/a.ts" }),
            event("pi", 2, "test.completed", { suite: "unit" }),
          ],
        },
        {
          variantId: "codex",
          events: [
            event("codex", 1, "file.read.completed", { path: "src/a.ts" }),
            event("codex", 2, "command.completed", { argv: ["pnpm", "test"] }),
          ],
        },
      ],
    });
    expect(
      timeline.rows.find((row) => row.alignmentKey.includes("src/a.ts"))
        ?.occurrences,
    ).toHaveLength(2);
    expect(timeline.unavailable).toContainEqual({
      variantId: "codex",
      lane: "test",
      reason: "not_exposed_in_normalized_trace",
    });
  });
  it("retains source order within each trace and labels truncation", () => {
    const timeline = buildTrajectoryTimeline({
      traces: [
        {
          variantId: "pi",
          events: [
            event("pi", 2, "edit.completed", { path: "b" }),
            event("pi", 1, "search.completed", { query: "a" }),
          ],
        },
      ],
      maxEvents: 1,
    });
    expect(timeline.rows[0]?.occurrences[0]?.sequence).toBe(1);
    expect(timeline.truncated).toBe(true);
    expect(timeline.unavailable).toContainEqual({
      variantId: "pi",
      lane: "edit",
      reason: "not_retained_due_to_timeline_limit",
    });
  });
});
