import type { CommandResult } from "@patchrace/core";

import type { PiSessionEntry } from "./pi-api.js";

export const PATCHRACE_SESSION_ENTRY = "patchrace-state-v1";
export const PATCHRACE_SESSION_SCHEMA_VERSION = "1.0.0";

export interface PatchRaceSessionStateV1 {
  readonly schemaVersion: typeof PATCHRACE_SESSION_SCHEMA_VERSION;
  readonly command: string;
  readonly status: CommandResult["status"];
  readonly runId: string | null;
  readonly artifactRoot: string | null;
}

function optionalString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value))
    return null;
  const found = value[key as keyof typeof value];
  return typeof found === "string" ? found : null;
}

export function stateFromResult(
  result: CommandResult,
): PatchRaceSessionStateV1 {
  return {
    schemaVersion: PATCHRACE_SESSION_SCHEMA_VERSION,
    command: result.command,
    status: result.status,
    runId: optionalString(result.data, "runId"),
    artifactRoot: optionalString(result.data, "artifactRoot"),
  };
}

export function latestSessionState(
  entries: readonly PiSessionEntry[],
): PatchRaceSessionStateV1 | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry?.type !== "custom" ||
      entry.customType !== PATCHRACE_SESSION_ENTRY ||
      typeof entry.data !== "object" ||
      entry.data === null
    )
      continue;
    const data = entry.data as Partial<PatchRaceSessionStateV1>;
    if (
      data.schemaVersion === PATCHRACE_SESSION_SCHEMA_VERSION &&
      typeof data.command === "string" &&
      (data.status === "completed" ||
        data.status === "dry-run" ||
        data.status === "placeholder") &&
      (typeof data.runId === "string" || data.runId === null) &&
      (typeof data.artifactRoot === "string" || data.artifactRoot === null)
    )
      return data as PatchRaceSessionStateV1;
  }
  return null;
}

export function sessionStateLines(
  state: PatchRaceSessionStateV1,
): readonly string[] {
  return [
    `PatchRace ${state.command}: ${state.status}`,
    ...(state.runId === null ? [] : [`Run: ${state.runId}`]),
    ...(state.artifactRoot === null
      ? []
      : [`Artifacts: ${state.artifactRoot}`]),
  ];
}
