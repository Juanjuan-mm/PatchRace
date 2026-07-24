import { describe, expect, it } from "vitest";

import { PatchRaceError } from "@patchrace/contracts";

import { BudgetTracker } from "./budgets.js";
import { runScheduledJobs } from "./scheduler.js";

describe("scheduler and budgets", () => {
  it("runs ready jobs concurrently, serializes lock keys, and preserves input order", async () => {
    let active = 0;
    let sameLock = 0;
    let maxActive = 0;
    let maxSameLock = 0;
    const job = (id: string, lockKey?: string) => ({
      id,
      ...(lockKey === undefined ? {} : { lockKey }),
      run: async () => {
        active += 1;
        if (lockKey === "setup") sameLock += 1;
        maxActive = Math.max(maxActive, active);
        maxSameLock = Math.max(maxSameLock, sameLock);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        if (lockKey === "setup") sameLock -= 1;
        return id;
      },
    });
    const results = await runScheduledJobs(
      [job("a", "setup"), job("b", "setup"), job("c")],
      { concurrency: 3 },
    );
    expect(results.map((result) => result.value)).toEqual(["a", "b", "c"]);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxSameLock).toBe(1);
  });

  it("does not corrupt independent jobs when a dependency fails", async () => {
    const results = await runScheduledJobs(
      [
        {
          id: "failure",
          run: async () => {
            throw new PatchRaceError({
              code: "FIXTURE",
              category: "EXECUTION",
              message: "fixture",
            });
          },
        },
        {
          id: "dependent",
          dependencies: ["failure"],
          run: async () => "never",
        },
        { id: "independent", run: async () => "ok" },
      ],
      { concurrency: 2 },
    );
    expect(results.map((result) => result.status)).toEqual([
      "failed",
      "skipped",
      "completed",
    ]);
  });

  it("stops admitting trials at a hard run budget and preserves unknown cost", async () => {
    let now = 0;
    const budgets = new BudgetTracker(
      {
        wallMs: 100,
        maxTrials: 1,
        maxTokens: 10,
        maxCostUsd: 1,
        maxDiskBytes: 100,
      },
      () => now,
    );
    const results = await runScheduledJobs(
      [
        {
          id: "one",
          run: async ({ reportUsage }) => {
            reportUsage({ tokens: 4, costUsd: null });
            return 1;
          },
        },
        { id: "two", run: async () => 2 },
      ],
      { concurrency: 1, budgets },
    );
    expect(results.map((result) => result.status)).toEqual([
      "completed",
      "budget_exhausted",
    ]);
    expect(budgets.snapshot().consumed).toMatchObject({
      trials: 1,
      tokens: 4,
      costUsd: null,
    });
    now = 100;
    expect(() => budgets.assertAvailable()).toThrowError(PatchRaceError);
  });
});
