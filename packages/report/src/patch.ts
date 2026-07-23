import {
  PatchRaceError,
  SCHEMA_VERSION,
  type PatchComparisonV1,
  type TrialId,
} from "@patchrace/contracts";

function align(diff: string): PatchComparisonV1["sideBySide"] {
  const rows: PatchComparisonV1["sideBySide"][number][] = [];
  let left = 0;
  let right = 0;
  const lines = diff.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk !== null) {
      left = Number(hunk[1]);
      right = Number(hunk[2]);
      rows.push({
        leftLine: null,
        left: line,
        rightLine: null,
        right: line,
        kind: "metadata",
      });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      const next = lines[index + 1];
      if (next?.startsWith("+") === true && !next.startsWith("+++")) {
        rows.push({
          leftLine: left++,
          left: line.slice(1),
          rightLine: right++,
          right: next.slice(1),
          kind: "changed",
        });
        index += 1;
      } else
        rows.push({
          leftLine: left++,
          left: line.slice(1),
          rightLine: null,
          right: null,
          kind: "removed",
        });
    } else if (line.startsWith("+") && !line.startsWith("+++"))
      rows.push({
        leftLine: null,
        left: null,
        rightLine: right++,
        right: line.slice(1),
        kind: "added",
      });
    else if (line.startsWith(" "))
      rows.push({
        leftLine: left++,
        left: line.slice(1),
        rightLine: right++,
        right: line.slice(1),
        kind: "context",
      });
    else
      rows.push({
        leftLine: null,
        left: line,
        rightLine: null,
        right: line,
        kind: "metadata",
      });
  }
  return rows;
}

export function buildPatchComparison(options: {
  readonly trialId: TrialId;
  readonly unifiedDiff: string;
  readonly changedFiles: PatchComparisonV1["changedFiles"];
  readonly referencePatch?: string;
  readonly referenceAccess: "allowed" | "withheld";
  readonly maxBytes?: number;
}): PatchComparisonV1 {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (!Number.isInteger(maxBytes) || maxBytes < 1)
    throw new PatchRaceError({
      code: "PATCH_DISPLAY_LIMIT_INVALID",
      category: "CONFIG",
      message: "Patch display byte limit must be positive.",
      path: "maxBytes",
    });
  const bytes = Buffer.from(options.unifiedDiff);
  const truncated = bytes.byteLength > maxBytes;
  const unifiedDiff = truncated
    ? bytes.subarray(0, maxBytes).toString("utf8")
    : options.unifiedDiff;
  const reference =
    options.referencePatch === undefined
      ? {
          availability: "unavailable" as const,
          unifiedDiff: null,
          reason: "reference_patch_unavailable",
        }
      : options.referenceAccess === "allowed"
        ? {
            availability: "included" as const,
            unifiedDiff: options.referencePatch,
            reason: "phase_authorized",
          }
        : {
            availability: "withheld" as const,
            unifiedDiff: null,
            reason: "reference_patch_not_authorized_for_phase",
          };
  return {
    schemaVersion: SCHEMA_VERSION,
    trialId: options.trialId,
    changedFiles: [...options.changedFiles].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    unifiedDiff,
    sideBySide: align(unifiedDiff),
    reference,
    truncated,
  };
}
