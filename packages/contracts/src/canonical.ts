import { createHash, randomBytes } from "node:crypto";

import { PatchRaceError } from "./index.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function canonicalize(value: unknown, path: string): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PatchRaceError({
        code: "CANONICAL_JSON_NON_FINITE",
        category: "CONFIG",
        message: `Canonical JSON cannot contain a non-finite number at ${path}.`,
        path,
      });
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalize(entry, `${path}[${index}]`),
    );
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PatchRaceError({
        code: "CANONICAL_JSON_UNSUPPORTED_VALUE",
        category: "CONFIG",
        message: `Canonical JSON requires plain objects at ${path}.`,
        path,
      });
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry, `${path}.${key}`)]),
    );
  }
  throw new PatchRaceError({
    code: "CANONICAL_JSON_UNSUPPORTED_VALUE",
    category: "CONFIG",
    message: `Canonical JSON cannot contain ${typeof value} at ${path}.`,
    path,
  });
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}

export function sha256(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalHash(value: unknown): `sha256:${string}` {
  return sha256(canonicalJson(value));
}

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const idPattern = /^(?:run|trial)_[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(timestamp: number): string {
  let remaining = timestamp;
  let encoded = "";
  for (let index = 0; index < 10; index += 1) {
    encoded = crockford[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

function encodeRandom(bytes: Uint8Array): string {
  let bits = 0;
  let bitCount = 0;
  let encoded = "";
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5 && encoded.length < 16) {
      bitCount -= 5;
      encoded += crockford[(bits >>> bitCount) & 31];
      bits &= (1 << bitCount) - 1;
    }
  }
  if (encoded.length < 16) encoded += crockford[(bits << (5 - bitCount)) & 31];
  return encoded.padEnd(16, "0").slice(0, 16);
}

export type RunId = `run_${string}`;
export type TrialId = `trial_${string}`;

export function createSortableId(
  kind: "run" | "trial",
  options: {
    readonly now?: () => number;
    readonly random?: (size: number) => Uint8Array;
  } = {},
): RunId | TrialId {
  const timestamp = (options.now ?? Date.now)();
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 2 ** 48 - 1
  ) {
    throw new RangeError("ULID timestamp must be an unsigned 48-bit integer.");
  }
  const entropy = (options.random ?? randomBytes)(10);
  if (entropy.length !== 10)
    throw new RangeError("ULID entropy must contain 10 bytes.");
  return `${kind}_${encodeTime(timestamp)}${encodeRandom(entropy)}` as
    RunId | TrialId;
}

export function assertRunId(value: string): asserts value is RunId {
  if (!idPattern.test(value) || !value.startsWith("run_")) {
    throw new PatchRaceError({
      code: "RUN_ID_INVALID",
      category: "SAFETY",
      message: "Run ID is not a valid run_<ULID> identifier.",
      path: "runId",
    });
  }
}

export function assertTrialId(value: string): asserts value is TrialId {
  if (!idPattern.test(value) || !value.startsWith("trial_")) {
    throw new PatchRaceError({
      code: "TRIAL_ID_INVALID",
      category: "SAFETY",
      message: "Trial ID is not a valid trial_<ULID> identifier.",
      path: "trialId",
    });
  }
}
