import type { AdapterKind } from "./types.js";

export interface AdapterCompatibilityEntry {
  readonly adapter: AdapterKind;
  readonly executable: string;
  readonly range: string;
  readonly minimum: string;
  readonly maximumExclusive: string;
  readonly fixtureVersions: readonly string[];
  readonly degradations: readonly string[];
}

export const ADAPTER_COMPATIBILITY: Readonly<
  Record<AdapterKind, AdapterCompatibilityEntry>
> = Object.freeze({
  pi: {
    adapter: "pi",
    executable: "pi",
    range: ">=0.81.0 <0.82.0",
    minimum: "0.81.0",
    maximumExclusive: "0.82.0",
    fixtureVersions: ["0.81.0", "0.81.1"],
    degradations: [
      "Authentication readiness is unknown when no official status operation is available.",
      "Cost remains unavailable unless Pi emits it in the structured stream.",
      "Pi does not expose a vendor sandbox equivalent to PatchRace's requested sandbox label.",
      "Cumulative Pi message_update payloads remain exact in raw stdout but are omitted from structured records; completed messages and usage are retained from message_end.",
    ],
  },
  "claude-code": {
    adapter: "claude-code",
    executable: "claude",
    range: ">=2.1.104 <2.2.0",
    minimum: "2.1.104",
    maximumExclusive: "2.2.0",
    fixtureVersions: ["2.1.104", "2.1.218"],
    degradations: [
      "File and edit events depend on exposed tool-use content blocks.",
      "Subscription cost can be absent even when token usage is reported.",
      "Claude Code permission mode is reported separately and is not claimed as host sandbox containment.",
    ],
  },
  codex: {
    adapter: "codex",
    executable: "codex",
    range: ">=0.145.0 <0.147.0",
    minimum: "0.145.0",
    maximumExclusive: "0.147.0",
    fixtureVersions: ["0.145.0", "0.145.0-alpha.27", "0.146.0-alpha.3.1"],
    degradations: [
      "Search and file-read details are unavailable unless represented by an emitted item.",
      "Cost is unavailable unless a future supported stream reports it.",
    ],
  },
});

function parseVersion(value: string): readonly [number, number, number] | null {
  const match = /(?:^|\s|v)(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (match === null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return [major, minor, patch];
}

function compare(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

export function normalizeCliVersion(raw: string): string | null {
  const parsed = parseVersion(raw);
  return parsed === null ? null : parsed.join(".");
}

export function isSupportedVersion(kind: AdapterKind, raw: string): boolean {
  const parsed = parseVersion(raw);
  const entry = ADAPTER_COMPATIBILITY[kind];
  const minimum = parseVersion(entry.minimum);
  const maximum = parseVersion(entry.maximumExclusive);
  return (
    parsed !== null &&
    minimum !== null &&
    maximum !== null &&
    compare(parsed, minimum) >= 0 &&
    compare(parsed, maximum) < 0
  );
}
