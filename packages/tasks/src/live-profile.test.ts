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
  });
});
