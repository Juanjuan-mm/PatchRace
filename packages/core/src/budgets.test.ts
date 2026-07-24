import { describe, expect, it } from "vitest";

import { BudgetTracker } from "./budgets.js";

describe("BudgetTracker", () => {
  it("represents unavailable token and cost metrics as null rather than zero", () => {
    const tracker = new BudgetTracker(
      {
        wallMs: null,
        maxTrials: 2,
        maxTokens: null,
        maxCostUsd: null,
        maxDiskBytes: null,
      },
      () => 0,
    );
    tracker.reserveTrial();
    expect(tracker.snapshot().consumed).toMatchObject({
      trials: 1,
      tokens: null,
      costUsd: null,
    });
  });

  it("rejects reported token and disk exhaustion predictably", () => {
    const tracker = new BudgetTracker(
      {
        wallMs: null,
        maxTrials: null,
        maxTokens: 5,
        maxCostUsd: null,
        maxDiskBytes: 10,
      },
      () => 0,
    );
    expect(() => tracker.consume({ tokens: 5 })).toThrowError(/tokens/);
    const disk = new BudgetTracker(
      {
        wallMs: null,
        maxTrials: null,
        maxTokens: null,
        maxCostUsd: null,
        maxDiskBytes: 10,
      },
      () => 0,
    );
    expect(() => disk.consume({ diskBytes: 10 })).toThrowError(/disk/);
  });
});
