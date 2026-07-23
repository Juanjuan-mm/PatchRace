import { describe, expect, it } from "vitest";

import { type RaceProgressEventV1, type TrialId } from "@patchrace/contracts";

import { TerminalProgressView, formatRaceProgress } from "./terminal.js";

function event(
  sequence: number,
  phase: RaceProgressEventV1["phase"],
  completedTrials: number,
): RaceProgressEventV1 {
  return {
    schemaVersion: "1.0.0",
    sequence,
    phase,
    trialId: "trial_01J000000000000000000000001" as TrialId,
    taskId: "task-one",
    variantId: "pi-main",
    completedTrials,
    totalTrials: 1,
    message:
      phase === "interrupted" ? "partial evidence retained\u001b[2J" : null,
  };
}

describe("terminal race progress", () => {
  it("emits append-only plain stderr lines through interruption", () => {
    const stderr: string[] = [];
    const view = new TerminalProgressView({
      stderr: (text) => stderr.push(text),
    });
    view.update(event(1, "planned", 0));
    view.update(event(2, "running", 0));
    view.update(event(3, "grading", 0));
    view.update(event(4, "interrupted", 1));
    expect(stderr.join("")).toContain("[1/1]");
    expect(stderr.join("")).toContain("partial evidence retained [2J");
    expect(stderr.join("")).not.toContain("\u001b");
    expect(stderr).toHaveLength(4);
  });

  it("suppresses progress entirely in machine mode", () => {
    const stderr: string[] = [];
    const stdout: string[] = [];
    const view = new TerminalProgressView({
      stderr: (text) => stderr.push(text),
      machineMode: true,
    });
    view.update(event(1, "completed", 1));
    stdout.push('{"ok":true}\n');
    expect(stderr).toEqual([]);
    expect(stdout).toEqual(['{"ok":true}\n']);
  });

  it("rejects duplicated terminal state instead of corrupting counts", () => {
    const view = new TerminalProgressView({ stderr: () => undefined });
    view.update(event(1, "completed", 1));
    expect(() => view.update(event(2, "failed", 1))).toThrowError(
      /cannot be emitted twice/,
    );
  });

  it("formats a deterministic newline-delimited record", () => {
    expect(formatRaceProgress(event(1, "running", 0))).toBe(
      "[0/1] trial_01J000000000000000000000001 running (task-one / pi-main)\n",
    );
  });
});
