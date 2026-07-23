import { describe, expect, it } from "vitest";

import {
  FAILURE_CATEGORIES,
  FAILURE_CLASSIFICATION_PRECEDENCE,
  FAILURE_TAXONOMY,
  failureCategoryDefinition,
} from "./taxonomy.js";

describe("Pi failure taxonomy", () => {
  it("freezes all seven non-overlapping top-level categories", () => {
    expect(FAILURE_CATEGORIES).toEqual([
      "discovery",
      "context",
      "workflow",
      "tool",
      "verification",
      "capability",
      "unknown",
    ]);
    expect(Object.keys(FAILURE_TAXONOMY).sort()).toEqual(
      [...FAILURE_CATEGORIES].sort(),
    );
    for (const category of FAILURE_CATEGORIES) {
      const definition = failureCategoryDefinition(category);
      expect(definition.category).toBe(category);
      expect(definition.definition.length).toBeGreaterThan(40);
      expect(definition.positiveExamples.length).toBeGreaterThanOrEqual(2);
      expect(definition.excludeWhen.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps capability behind deterministic explanations and unknown last", () => {
    expect(FAILURE_CLASSIFICATION_PRECEDENCE.at(-2)).toBe("capability");
    expect(FAILURE_CLASSIFICATION_PRECEDENCE.at(-1)).toBe("unknown");
    expect(new Set(FAILURE_CLASSIFICATION_PRECEDENCE)).toEqual(
      new Set(FAILURE_CATEGORIES),
    );
  });
});
