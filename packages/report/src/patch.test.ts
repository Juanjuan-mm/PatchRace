import { describe, expect, it } from "vitest";
import type { TrialId } from "@patchrace/contracts";
import { buildPatchComparison } from "./patch.js";

const trialId = "trial_01J000000000000000000000001" as TrialId;
describe("patch comparison", () => {
  it("provides unified and aligned changed rows with protected evidence", () => {
    const value = buildPatchComparison({
      trialId,
      unifiedDiff: "@@ -1 +1 @@\n-old\n+new\n",
      changedFiles: [
        {
          path: "scoring.json",
          status: "modified",
          protectedPathViolation: true,
        },
      ],
      referenceAccess: "withheld",
    });
    expect(value.sideBySide).toContainEqual({
      leftLine: 1,
      left: "old",
      rightLine: 1,
      right: "new",
      kind: "changed",
    });
    expect(value.changedFiles[0]?.protectedPathViolation).toBe(true);
  });
  it("withholds reference content until explicitly phase-authorized", () => {
    const hidden = buildPatchComparison({
      trialId,
      unifiedDiff: "",
      changedFiles: [],
      referencePatch: "secret",
      referenceAccess: "withheld",
    });
    expect(JSON.stringify(hidden)).not.toContain("secret");
    const shown = buildPatchComparison({
      trialId,
      unifiedDiff: "",
      changedFiles: [],
      referencePatch: "reviewed",
      referenceAccess: "allowed",
    });
    expect(shown.reference.unifiedDiff).toBe("reviewed");
  });
  it("bounds oversized and binary-like patch evidence without execution", () => {
    const value = buildPatchComparison({
      trialId,
      unifiedDiff: `GIT binary patch\n${"x".repeat(50)}`,
      changedFiles: [
        { path: "asset.bin", status: "binary", protectedPathViolation: false },
      ],
      referenceAccess: "withheld",
      maxBytes: 16,
    });
    expect(value.truncated).toBe(true);
    expect(Buffer.byteLength(value.unifiedDiff)).toBeLessThanOrEqual(16);
  });
});
