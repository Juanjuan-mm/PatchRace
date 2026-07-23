import { describe, expect, it } from "vitest";

import { sha256, type SplitTaskInputV1 } from "@patchrace/contracts";

import {
  assertSplitAccess,
  createOptimizationSplitView,
  createTaskSplit,
  openFinalHoldout,
  verifyTaskSplit,
} from "./split.js";

function tasks(): SplitTaskInputV1[] {
  return ["bugfix", "feature"].flatMap((category) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `${category}-${index + 1}`,
      category,
      taskHash: sha256(`${category}-${index + 1}`),
    })),
  );
}

describe("task splits", () => {
  it("is order-independent, category-aware, and content-addressed", () => {
    const input = tasks();
    const first = createTaskSplit({ tasks: input, seed: "release-1" });
    const second = createTaskSplit({
      tasks: [...input].reverse(),
      seed: "release-1",
    });

    expect(first).toEqual(second);
    expect(first.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.taskSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.holdoutCommitmentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.categories).toEqual({
      bugfix: { total: 6, training: 4, validation: 1, holdout: 1 },
      feature: { total: 6, training: 4, validation: 1, holdout: 1 },
    });
    expect(() => verifyTaskSplit(first)).not.toThrow();

    const changed = createTaskSplit({
      tasks: input.map((task, index) =>
        index === 0 ? { ...task, taskHash: sha256("changed") } : task,
      ),
      seed: "release-1",
    });
    expect(changed.taskSetHash).not.toBe(first.taskSetHash);
    expect(changed.manifestHash).not.toBe(first.manifestHash);
  });

  it("hides holdout ids from optimization and enforces phase access", () => {
    const manifest = createTaskSplit({ tasks: tasks(), seed: "release-1" });
    const view = createOptimizationSplitView(manifest);
    const serialized = JSON.stringify(view);
    for (const id of manifest.assignments.holdout)
      expect(serialized).not.toContain(id);
    expect(view.holdout).toEqual({
      count: manifest.assignments.holdout.length,
      commitmentHash: manifest.holdoutCommitmentHash,
    });

    expect(() =>
      assertSplitAccess({
        manifest,
        phase: "candidate-generation",
        taskIds: manifest.assignments.training,
      }),
    ).not.toThrow();
    expect(() =>
      assertSplitAccess({
        manifest,
        phase: "candidate-generation",
        taskIds: [manifest.assignments.holdout[0]!],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          code: "TASK_SPLIT_ACCESS_FORBIDDEN",
        }),
      }),
    );

    const access = openFinalHoldout(manifest, {
      gateId: "m5-final",
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });
    expect(() =>
      assertSplitAccess({
        manifest,
        phase: "final-holdout",
        taskIds: manifest.assignments.holdout,
        holdoutAccess: access,
      }),
    ).not.toThrow();
    expect(() =>
      assertSplitAccess({
        manifest,
        phase: "final-holdout",
        taskIds: manifest.assignments.holdout,
        holdoutAccess: { ...access, gateId: "tampered" },
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          code: "TASK_SPLIT_HOLDOUT_ACCESS_REQUIRED",
        }),
      }),
    );
  });

  it("rejects duplicate tasks, invalid ratios, and manifest tampering", () => {
    const input = tasks();
    expect(() =>
      createTaskSplit({ tasks: [input[0]!, input[0]!], seed: "seed" }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ code: "TASK_SPLIT_DUPLICATE_ID" }),
      }),
    );
    expect(() =>
      createTaskSplit({
        tasks: input,
        seed: "seed",
        ratios: { training: 0.5, validation: 0.5, holdout: 0.5 },
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ code: "TASK_SPLIT_RATIOS_INVALID" }),
      }),
    );

    const manifest = createTaskSplit({ tasks: input, seed: "seed" });
    expect(() =>
      verifyTaskSplit({
        ...manifest,
        assignments: {
          ...manifest.assignments,
          training: [...manifest.assignments.training, "invented"],
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          code: "TASK_SPLIT_MANIFEST_TAMPERED",
        }),
      }),
    );
  });
});
