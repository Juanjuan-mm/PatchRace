import { describe, expect, it } from "vitest";
import type { TraceEventV1, TrialId } from "@patchrace/contracts";

import { alignObservableTrajectories } from "./alignment.js";

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

describe("cross-Agent observable trajectory alignment", () => {
  it("aligns equivalent actions without requiring equal vendor tools", () => {
    const result = alignObservableTrajectories({
      traces: [
        {
          variantId: "pi",
          events: [
            event("pi", 1, "file.read.completed", { path: "./src/a.ts" }),
            event("pi", 2, "search.completed", {
              query: "needle",
              scope: "src",
              tool: "ripgrep",
            }),
            event("pi", 3, "command.completed", {
              argv: ["pnpm", "test"],
              exitCode: 0,
            }),
          ],
        },
        {
          variantId: "codex",
          events: [
            event("codex", 1, "file.read.completed", { path: "src/a.ts" }),
            event("codex", 2, "search.completed", {
              query: "needle",
              scope: "src",
              tool: "search_tool",
            }),
            event("codex", 3, "test.completed", { exitCode: 0 }),
          ],
        },
      ],
    });
    expect(
      result.groups.filter((group) => group.relation === "cross-variant"),
    ).toHaveLength(3);
    expect(
      result.groups.find((group) => group.action === "run-test")?.occurrences,
    ).toHaveLength(2);
    expect(result.groups[0]?.occurrences[0]).toMatchObject({
      eventId: "codex-1",
      rawRef: { path: "raw/events.jsonl", record: 1 },
      ordinal: 1,
    });
  });

  it("keeps unsupported lanes explicit and ignores observable messages", () => {
    const result = alignObservableTrajectories({
      traces: [
        {
          variantId: "pi",
          events: [
            event("pi", 1, "message.observable", {
              text: "private-message-content-42",
            }),
          ],
          actions: {
            search: {
              availability: "unavailable",
              reason: "adapter_does_not_expose_search",
            },
          },
        },
        {
          variantId: "codex",
          events: [event("codex", 1, "edit.completed", { path: "src/a.ts" })],
        },
      ],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.action).toBe("edit-file");
    expect(result.unavailable).toContainEqual({
      variantId: "pi",
      action: "search",
      reason: "adapter_does_not_expose_search",
    });
    expect(JSON.stringify(result)).not.toContain("private-message-content-42");
  });
});
