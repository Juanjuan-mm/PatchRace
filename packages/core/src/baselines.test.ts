import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComparisonBaselineV1 } from "@patchrace/contracts";
import {
  readComparisonBaseline,
  writeComparisonBaseline,
} from "./baselines.js";

const hash = `sha256:${"a".repeat(64)}` as const;
const baseline: ComparisonBaselineV1 = {
  schemaVersion: "1.0.0",
  baselineSchemaVersion: "1.0.0",
  name: "main",
  acceptedAt: "2026-07-23T00:00:00.000Z",
  sourcePlanHash: hash,
  taskHashes: [hash],
  policyId: "correctness-first-v1",
  aggregate: {
    variantId: "pi",
    variantHash: hash,
    trialCount: 3,
    completedCount: 3,
    validCount: 3,
    passedCount: 3,
    failedCount: 0,
    hardGatePassRate: 1,
    allHardGatesPassed: true,
    raw: {
      stabilityVariance: {
        value: 0,
        unit: "ratio²",
        availability: "derived",
        source: "test",
      },
      meanCostUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "test",
      },
      meanLatencyMs: {
        value: 1,
        unit: "ms",
        availability: "derived",
        source: "test",
      },
      meanFootprintLines: {
        value: 1,
        unit: "lines",
        availability: "derived",
        source: "test",
      },
    },
    caveats: [],
  },
};
describe("baseline persistence", () => {
  it("writes create-new and reads current baselines", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-baseline-"));
    await writeComparisonBaseline(root, baseline);
    await expect(writeComparisonBaseline(root, baseline)).rejects.toThrow(
      /cannot be overwritten/,
    );
    expect((await readComparisonBaseline(root, "main")).baseline).toEqual(
      baseline,
    );
  });
  it("migrates supported legacy views without rewriting source", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-baseline-"));
    const legacy = { ...baseline, baselineSchemaVersion: "0.1.0" };
    const path = join(root, "main.json");
    await writeFile(path, JSON.stringify(legacy));
    const loaded = await readComparisonBaseline(root, "main");
    expect(loaded.migratedFrom).toBe("0.1.0");
    expect(JSON.parse(await readFile(path, "utf8")).baselineSchemaVersion).toBe(
      "0.1.0",
    );
  });
  it("refuses a baseline symlink instead of following it", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-baseline-"));
    const outside = join(root, "outside.json");
    await writeFile(outside, JSON.stringify(baseline));
    await symlink(outside, join(root, "main.json"));
    await expect(readComparisonBaseline(root, "main")).rejects.toThrow(
      /non-symlink file/,
    );
  });
  it("rejects tampered identity and aggregate content", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-baseline-"));
    await writeFile(
      join(root, "main.json"),
      JSON.stringify({
        ...baseline,
        name: "other",
        aggregate: { ...baseline.aggregate, validCount: -1 },
      }),
    );
    await expect(readComparisonBaseline(root, "main")).rejects.toThrow(
      /content is invalid/,
    );
  });
});
