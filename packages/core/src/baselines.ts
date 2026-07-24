import { lstat, readFile, writeFile } from "node:fs/promises";
import {
  PatchRaceError,
  canonicalJson,
  type ComparisonBaselineV1,
} from "@patchrace/contracts";
import {
  assertSafeRoot,
  ensureOwnedDirectory,
  resolveOwnedPath,
} from "./safety.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function baselineInvalid(path: string): never {
  throw new PatchRaceError({
    code: "BASELINE_CONTENT_INVALID",
    category: "CONFIG",
    message: `Stored baseline content is invalid at ${path}.`,
    path,
  });
}

function assertMetric(value: unknown, path: string): void {
  if (!isObject(value)) baselineInvalid(path);
  if (
    !(
      value["value"] === null ||
      (typeof value["value"] === "number" && Number.isFinite(value["value"]))
    ) ||
    typeof value["unit"] !== "string" ||
    !["observed", "derived", "unavailable"].includes(
      String(value["availability"]),
    ) ||
    typeof value["source"] !== "string"
  )
    baselineInvalid(path);
}

function assertBaseline(
  value: unknown,
  expectedName: string,
): asserts value is ComparisonBaselineV1 {
  if (!isObject(value)) baselineInvalid("$");
  if (
    value["schemaVersion"] !== "1.0.0" ||
    value["baselineSchemaVersion"] !== "1.0.0" ||
    value["name"] !== expectedName ||
    typeof value["acceptedAt"] !== "string" ||
    !Number.isFinite(Date.parse(value["acceptedAt"])) ||
    typeof value["sourcePlanHash"] !== "string" ||
    !hashPattern.test(value["sourcePlanHash"]) ||
    !Array.isArray(value["taskHashes"]) ||
    value["taskHashes"].length === 0 ||
    !value["taskHashes"].every(
      (hash) => typeof hash === "string" && hashPattern.test(hash),
    ) ||
    new Set(value["taskHashes"]).size !== value["taskHashes"].length ||
    typeof value["policyId"] !== "string" ||
    !isObject(value["aggregate"])
  )
    baselineInvalid("$");
  const aggregate = value["aggregate"];
  const counts = [
    "trialCount",
    "completedCount",
    "validCount",
    "passedCount",
    "failedCount",
  ];
  if (
    typeof aggregate["variantId"] !== "string" ||
    typeof aggregate["variantHash"] !== "string" ||
    !hashPattern.test(aggregate["variantHash"]) ||
    counts.some(
      (name) =>
        !Number.isInteger(aggregate[name]) || (aggregate[name] as number) < 0,
    ) ||
    !(
      aggregate["hardGatePassRate"] === null ||
      (typeof aggregate["hardGatePassRate"] === "number" &&
        aggregate["hardGatePassRate"] >= 0 &&
        aggregate["hardGatePassRate"] <= 1)
    ) ||
    typeof aggregate["allHardGatesPassed"] !== "boolean" ||
    !isObject(aggregate["raw"]) ||
    !Array.isArray(aggregate["caveats"]) ||
    !aggregate["caveats"].every((entry) => typeof entry === "string")
  )
    baselineInvalid("aggregate");
  for (const name of [
    "stabilityVariance",
    "meanCostUsd",
    "meanLatencyMs",
    "meanFootprintLines",
  ])
    assertMetric(aggregate["raw"][name], `aggregate.raw.${name}`);
}

export async function writeComparisonBaseline(
  directory: string,
  baseline: ComparisonBaselineV1,
): Promise<string> {
  const root = assertSafeRoot(directory, "baselineDirectory");
  await ensureOwnedDirectory(root, ".");
  const path = resolveOwnedPath(root, `${baseline.name}.json`);
  await writeFile(path, `${canonicalJson(baseline)}\n`, {
    flag: "wx",
    mode: 0o600,
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new PatchRaceError({
        code: "BASELINE_EXISTS",
        category: "CONFLICT",
        message: `Baseline '${baseline.name}' already exists and cannot be overwritten.`,
        path: baseline.name,
      });
    throw error;
  });
  return path;
}

export async function readComparisonBaseline(
  directory: string,
  name: string,
): Promise<{
  readonly baseline: ComparisonBaselineV1;
  readonly migratedFrom: string | null;
}> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name))
    throw new PatchRaceError({
      code: "BASELINE_NAME_INVALID",
      category: "CONFIG",
      message: "Baseline name is invalid.",
      path: "name",
    });
  const root = assertSafeRoot(directory, "baselineDirectory");
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new PatchRaceError({
      code: "BASELINE_ROOT_UNSAFE",
      category: "SAFETY",
      message: "Baseline directory must be a real directory.",
      path: "baselineDirectory",
    });
  const path = resolveOwnedPath(root, `${name}.json`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new PatchRaceError({
      code: "BASELINE_FILE_UNSAFE",
      category: "SAFETY",
      message: "Baseline source must be a regular non-symlink file.",
      path: name,
    });
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  if (parsed["schemaVersion"] !== "1.0.0")
    throw new PatchRaceError({
      code: "BASELINE_SCHEMA_INCOMPATIBLE",
      category: "CONFIG",
      message: "Baseline schema major version is unsupported.",
      path: "schemaVersion",
    });
  if (parsed["baselineSchemaVersion"] === "1.0.0") {
    assertBaseline(parsed, name);
    return { baseline: parsed, migratedFrom: null };
  }
  if (parsed["baselineSchemaVersion"] === "0.1.0") {
    const migrated = {
      ...parsed,
      baselineSchemaVersion: "1.0.0",
      policyId:
        typeof parsed["policyId"] === "string"
          ? parsed["policyId"]
          : "correctness-first-v1",
    };
    assertBaseline(migrated, name);
    return { baseline: migrated, migratedFrom: "0.1.0" };
  }
  throw new PatchRaceError({
    code: "BASELINE_SCHEMA_INCOMPATIBLE",
    category: "CONFIG",
    message: "Baseline format cannot be migrated safely.",
    path: "baselineSchemaVersion",
  });
}
