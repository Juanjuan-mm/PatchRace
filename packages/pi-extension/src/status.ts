import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  ArtifactStore,
  type ArtifactRecord,
  type RunManifest,
} from "@patchrace/core";

import { tokenizeArguments } from "./arguments.js";
import type { PiExtensionApi, PiExtensionCommandContext } from "./pi-api.js";
import {
  latestSessionState,
  PATCHRACE_SESSION_ENTRY,
  PATCHRACE_SESSION_SCHEMA_VERSION,
} from "./session-state.js";

const STATUS_WIDGET = "patchrace-run-status";
const MAX_OPEN_BYTES = 2 * 1024 * 1024;
const MAX_DISCOVERED_RUNS = 1_000;

interface RunStatus {
  readonly store: ArtifactStore;
  readonly manifest: RunManifest;
  readonly executionStatus: string;
  readonly completedTrials: number | null;
  readonly plannedTrials: number | null;
  readonly artifacts: readonly ArtifactRecord[];
}

function isDescendant(root: string, target: string): boolean {
  const difference = relative(root, target);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

async function projectStateRoot(
  cwd: string,
  stateDir: string,
): Promise<string> {
  const projectRoot = await realpath(resolve(cwd));
  const stateRoot = await realpath(resolve(projectRoot, stateDir));
  if (!isDescendant(projectRoot, stateRoot))
    throw new Error("PatchRace status state must remain project-local.");
  return stateRoot;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`PatchRace ${label} has an incompatible object shape.`);
  return value as Record<string, unknown>;
}

async function readJson(path: string, label: string): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`PatchRace ${label} must be a regular non-symlink file.`);
  if (info.size > MAX_OPEN_BYTES)
    throw new Error(`PatchRace ${label} exceeds the 2 MiB display limit.`);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function inspectRun(
  stateRoot: string,
  runId: string,
): Promise<RunStatus> {
  const store = await ArtifactStore.open(stateRoot, runId);
  const executionPath = resolve(store.runRoot, "execution.json");
  const execution = await readJson(executionPath, "execution").catch(
    (error: NodeJS.ErrnoException) =>
      error.code === "ENOENT" ? null : Promise.reject(error),
  );
  const executionValue =
    execution === null ? null : object(execution, "execution");
  const trials = executionValue?.["trials"];
  const plan = executionValue?.["plan"];
  const tasks = plan === undefined ? null : object(plan, "race plan")["tasks"];
  const variants =
    plan === undefined ? null : object(plan, "race plan")["variants"];
  const repetitions =
    plan === undefined ? null : object(plan, "race plan")["repetitions"];
  const plannedTrials =
    Array.isArray(tasks) &&
    Array.isArray(variants) &&
    typeof repetitions === "number"
      ? tasks.length * variants.length * repetitions
      : null;
  const indexPath = resolve(store.runRoot, "artifact-index.json");
  const index = await readJson(indexPath, "artifact index").catch(
    (error: NodeJS.ErrnoException) =>
      error.code === "ENOENT" ? null : Promise.reject(error),
  );
  const artifactsValue =
    index === null ? [] : object(index, "artifact index")["artifacts"];
  if (!Array.isArray(artifactsValue))
    throw new Error("PatchRace artifact index is missing its artifact list.");
  const artifacts = artifactsValue.map((item): ArtifactRecord => {
    const value = object(item, "artifact record");
    if (
      typeof value["logicalPath"] !== "string" ||
      typeof value["mediaType"] !== "string" ||
      typeof value["size"] !== "number" ||
      typeof value["hash"] !== "string"
    )
      throw new Error("PatchRace artifact index contains an invalid record.");
    return item as ArtifactRecord;
  });
  return {
    store,
    manifest: store.manifest,
    executionStatus:
      typeof executionValue?.["status"] === "string"
        ? executionValue["status"]
        : "reserved-or-interrupted",
    completedTrials: Array.isArray(trials) ? trials.length : null,
    plannedTrials,
    artifacts,
  };
}

async function discoverNewestRun(stateRoot: string): Promise<string | null> {
  const runsRoot = resolve(stateRoot, "runs");
  const entries = await readdir(runsRoot, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) =>
      error.code === "ENOENT" ? [] : Promise.reject(error),
  );
  if (entries.length > MAX_DISCOVERED_RUNS)
    throw new Error(
      "PatchRace run discovery exceeds the 1000-run safety limit.",
    );
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map(async (entry) => {
        const store = await ArtifactStore.open(stateRoot, entry.name);
        return {
          runId: store.runId,
          createdAt: store.manifest.createdAt,
        };
      }),
  );
  return (
    manifests.sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.runId.localeCompare(left.runId),
    )[0]?.runId ?? null
  );
}

function summary(value: RunStatus): readonly string[] {
  return [
    `PatchRace run ${value.manifest.runId}`,
    `Created: ${value.manifest.createdAt}`,
    `Execution: ${value.executionStatus}`,
    `Trials: ${value.completedTrials === null ? "unavailable" : String(value.completedTrials)}/${value.plannedTrials === null ? "unavailable" : String(value.plannedTrials)}`,
    `Artifacts: ${String(value.artifacts.length)}`,
  ];
}

function supportedText(record: ArtifactRecord): boolean {
  return (
    record.mediaType.startsWith("text/") ||
    record.mediaType === "application/json" ||
    record.mediaType === "application/jsonl" ||
    record.logicalPath.endsWith(".diff") ||
    record.logicalPath.endsWith(".md")
  );
}

async function openArtifact(
  run: RunStatus,
  record: ArtifactRecord,
  context: PiExtensionCommandContext,
): Promise<void> {
  if (!supportedText(record))
    throw new Error(
      `Artifact '${record.logicalPath}' is not a supported text artifact.`,
    );
  if (record.size > MAX_OPEN_BYTES)
    throw new Error(
      `Artifact '${record.logicalPath}' exceeds the 2 MiB display limit.`,
    );
  const path = resolve(run.store.runRoot, record.logicalPath);
  if (!isDescendant(run.store.runRoot, path))
    throw new Error("Artifact path escapes the owned run root.");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("Artifact must be a regular non-symlink file.");
  const canonical = await realpath(path);
  if (!isDescendant(run.store.runRoot, canonical))
    throw new Error("Artifact resolves outside the owned run root.");
  if ((await stat(canonical)).size !== record.size)
    throw new Error("Artifact size no longer matches its immutable index.");
  await run.store.verify(record.logicalPath, record.hash);
  await context.ui.editor(
    `${run.manifest.runId}: ${record.logicalPath}`,
    await readFile(canonical, "utf8"),
  );
}

function preferredArtifacts(run: RunStatus): readonly ArtifactRecord[] {
  const preferred = [
    "report/report.json",
    "report/index.html",
    "diagnosis/diagnosis.json",
    "execution.json",
    "manifest.json",
  ];
  return [...run.artifacts].sort((left, right) => {
    const leftIndex = preferred.indexOf(left.logicalPath);
    const rightIndex = preferred.indexOf(right.logicalPath);
    return (
      (leftIndex < 0 ? preferred.length : leftIndex) -
        (rightIndex < 0 ? preferred.length : rightIndex) ||
      left.logicalPath.localeCompare(right.logicalPath)
    );
  });
}

function parseStatusArguments(raw: string): {
  readonly runId: string | null;
  readonly stateDir: string;
} {
  const tokens = tokenizeArguments(raw);
  let runId: string | null = null;
  let stateDir = ".patchrace";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--state-dir") {
      const value = tokens[index + 1];
      if (value === undefined) throw new Error("--state-dir requires a value.");
      stateDir = value;
      index += 1;
    } else if (token.startsWith("--"))
      throw new Error(`Unsupported status option '${token}'.`);
    else if (runId === null) runId = token;
    else throw new Error("Status accepts at most one run ID.");
  }
  return { runId, stateDir };
}

export function registerStatusCommand(pi: PiExtensionApi): void {
  pi.registerCommand("status", {
    description: "Restore durable PatchRace status and navigate run artifacts",
    handler: async (rawArguments, context) => {
      try {
        const parsed = parseStatusArguments(rawArguments);
        const stateRoot = await projectStateRoot(context.cwd, parsed.stateDir);
        const remembered =
          latestSessionState(context.sessionManager.getEntries())?.runId ??
          null;
        const runId =
          parsed.runId ?? remembered ?? (await discoverNewestRun(stateRoot));
        if (runId === null) {
          context.ui.notify("No durable PatchRace run was found.", "warning");
          return;
        }
        context.ui.setStatus(STATUS_WIDGET, `loading ${runId}`);
        const run = await inspectRun(stateRoot, runId);
        const lines = summary(run);
        pi.appendEntry(PATCHRACE_SESSION_ENTRY, {
          schemaVersion: PATCHRACE_SESSION_SCHEMA_VERSION,
          command: "status",
          status: "completed",
          runId,
          artifactRoot: relative(context.cwd, run.store.runRoot),
        });
        context.ui.setWidget(STATUS_WIDGET, lines);
        const artifacts = preferredArtifacts(run).filter(supportedText);
        if (artifacts.length === 0) {
          context.ui.notify(lines.join("\n"), "info");
          return;
        }
        const labels = artifacts.map(
          (artifact) =>
            `${artifact.logicalPath} (${artifact.mediaType}, ${String(artifact.size)} bytes)`,
        );
        const selected = await context.ui.select(
          `${runId}: open recorded artifact`,
          [...labels, "Close"],
        );
        const index = selected === undefined ? -1 : labels.indexOf(selected);
        if (index >= 0) await openArtifact(run, artifacts[index]!, context);
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(STATUS_WIDGET, undefined);
      }
    },
  });
}
