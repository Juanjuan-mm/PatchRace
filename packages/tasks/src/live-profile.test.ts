import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("live parity profile", () => {
  it("allows required engine edits while independently protecting dependencies", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../../../scripts/prepare-live-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain("const dependencyFields = [");
    expect(source).toContain(
      "const baselineCommit = ${JSON.stringify(commit)};",
    );
    expect(source).toContain(
      'execFileSync("git", ["show", baselineCommit + ":" + path]',
    );
    expect(source).toContain("sortedEntries(manifest[field])");
    expect(source).toContain("sortedEntries(baseline[field])");
    expect(source).toContain("allowDependencyChanges: true");
    expect(source).toContain("allowLockfileChanges: false");
    expect(source).toContain("/Node 22.*24.*26/u");
    expect(source).toContain(
      "windows-2025, macos-15, macos-15-intel, ubuntu-22.04, ubuntu-24.04, and ubuntu-24.04-arm",
    );
    expect(source).toContain(
      'const verifierRoot = join(workspace, "verifier")',
    );
    expect(source).toContain('visibility: "hidden"');
    expect(source).toContain('paths: [".patchrace-live/**"]');
    expect(source).toContain("maxOutputBytes: 128 * 1024 * 1024");
    expect(source).toContain("maxRecords: 100_000");
  });

  it("keeps aggregate and single-trial live cost ceilings distinct", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../../../scripts/run-live-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain(
      "authorization.maxSingleTrialCostUsd <= authorization.maxCostUsd",
    );
    expect(source).toContain(
      "task.budgets.maxCostUsd = authorization.maxSingleTrialCostUsd",
    );
    expect(source).not.toContain(
      "authorization.maxCostUsd /\n  (authorization.repeat * authorization.variants.length)",
    );
    expect(source).toContain('"--verifier-root",\n  verifierRoot');
  });
});
