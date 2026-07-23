import { resolve } from "node:path";
import { PatchRaceError, canonicalHash, sha256 } from "@patchrace/contracts";
import {
  Redactor,
  createRedactedExport,
  type RedactedExportResult,
  type RedactionFinding,
  type RedactionProfile,
} from "./redaction.js";
import {
  assertSafeRoot,
  readRegularFileNoFollow,
  resolveOwnedPath,
} from "./safety.js";

export interface RedactedReportPreview {
  readonly schemaVersion: "1.0.0";
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly logicalPaths: readonly string[];
  readonly files: readonly {
    readonly logicalPath: string;
    readonly sourceHash: `sha256:${string}`;
    readonly exportHash: `sha256:${string}`;
  }[];
  readonly findings: readonly RedactionFinding[];
  readonly excludedByDefault: readonly string[];
  readonly residualWarning: string;
  readonly previewHash: `sha256:${string}`;
}

export async function previewRedactedReportExport(options: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly logicalPaths: readonly string[];
  readonly profile?: RedactionProfile;
  readonly maxFileBytes?: number;
}): Promise<RedactedReportPreview> {
  const sourceRoot = assertSafeRoot(options.sourceRoot, "sourceRoot");
  const destinationRoot = assertSafeRoot(
    options.destinationRoot,
    "destinationRoot",
  );
  if (resolve(sourceRoot) === resolve(destinationRoot))
    throw new PatchRaceError({
      code: "REDACTION_IN_PLACE_REFUSED",
      category: "SAFETY",
      message:
        "A report export destination must be distinct from raw evidence.",
      path: "destinationRoot",
    });
  const logicalPaths = [...new Set(options.logicalPaths)].sort();
  if (
    logicalPaths.length === 0 ||
    logicalPaths.some(
      (path) =>
        !path.startsWith("report/shareable/") ||
        path.includes("/raw/") ||
        path.endsWith("patch.diff"),
    )
  )
    throw new PatchRaceError({
      code: "REPORT_EXPORT_SELECTION_UNSAFE",
      category: "SAFETY",
      message:
        "Shareable export may select only the privacy-projected report/shareable files.",
      path: "logicalPaths",
    });
  const redactor = new Redactor(options.profile);
  const files = [];
  for (const logicalPath of logicalPaths) {
    const source = resolveOwnedPath(sourceRoot, logicalPath);
    const input = await readRegularFileNoFollow(
      source,
      logicalPath,
      options.maxFileBytes ?? 16 * 1024 * 1024,
    );
    if (input.includes(0))
      throw new PatchRaceError({
        code: "EXPORT_BINARY_EXCLUDED",
        category: "SAFETY",
        message: `Binary artifact is excluded: ${logicalPath}.`,
        path: logicalPath,
      });
    files.push({
      logicalPath,
      sourceHash: sha256(input),
      exportHash: sha256(redactor.redactText(input.toString("utf8"))),
    });
  }
  const body = {
    schemaVersion: "1.0.0" as const,
    sourceRoot,
    destinationRoot,
    logicalPaths,
    files,
    findings: redactor.findings(),
    excludedByDefault: [
      "raw streams",
      "prompts",
      "source patches",
      "unselected artifacts",
    ],
    residualWarning:
      "Configured redaction was applied; absence of unknown secrets is not guaranteed.",
  };
  return { ...body, previewHash: canonicalHash(body) };
}

export async function executeRedactedReportExport(options: {
  readonly preview: RedactedReportPreview;
  readonly confirmation: "confirmed" | "not-confirmed";
  readonly profile?: RedactionProfile;
  readonly maxFileBytes?: number;
}): Promise<RedactedExportResult> {
  if (options.confirmation !== "confirmed")
    throw new PatchRaceError({
      code: "REPORT_EXPORT_CONFIRMATION_REQUIRED",
      category: "USAGE",
      message: "Redacted report export requires explicit confirmation.",
      path: "confirmation",
    });
  const current = await previewRedactedReportExport({
    sourceRoot: options.preview.sourceRoot,
    destinationRoot: options.preview.destinationRoot,
    logicalPaths: options.preview.logicalPaths,
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.maxFileBytes === undefined
      ? {}
      : { maxFileBytes: options.maxFileBytes }),
  });
  if (current.previewHash !== options.preview.previewHash)
    throw new PatchRaceError({
      code: "REPORT_EXPORT_SOURCE_DRIFT",
      category: "CONFLICT",
      message:
        "Report evidence changed after preview; review a new export preview.",
      path: "previewHash",
    });
  return createRedactedExport({
    sourceRoot: current.sourceRoot,
    destinationRoot: current.destinationRoot,
    logicalPaths: current.logicalPaths,
    redactor: new Redactor(options.profile),
    ...(options.maxFileBytes === undefined
      ? {}
      : { maxFileBytes: options.maxFileBytes }),
  });
}
