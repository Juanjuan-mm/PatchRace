import type { JsonValue } from "@patchrace/contracts";

import type { RawRecord } from "./types.js";

export interface JsonlLimits {
  readonly maxRecords: number;
  readonly maxRecordBytes: number;
  readonly maxJsonDepth: number;
}

function jsonDepth(value: JsonValue, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  let maximum = depth + 1;
  const entries: readonly JsonValue[] = Array.isArray(value)
    ? value
    : Object.values(value as Readonly<Record<string, JsonValue>>);
  for (const entry of entries)
    maximum = Math.max(maximum, jsonDepth(entry, depth + 1));
  return maximum;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function vendorType(value: JsonValue): string | undefined {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    return undefined;
  const type = (value as Readonly<Record<string, JsonValue>>)["type"];
  return typeof type === "string" ? type : undefined;
}

export class JsonlCollector {
  readonly #stream: "stdout" | "stderr";
  readonly #parseJson: boolean;
  readonly #limits: JsonlLimits;
  readonly #nextSequence: () => number;
  readonly #onRecord: (record: RawRecord) => Promise<void>;
  readonly #now: () => number;
  #pending = Buffer.alloc(0);
  #offset = 0;
  #recordCount = 0;
  #recordLimitReported = false;

  constructor(options: {
    readonly stream: "stdout" | "stderr";
    readonly parseJson: boolean;
    readonly limits: JsonlLimits;
    readonly nextSequence: () => number;
    readonly onRecord: (record: RawRecord) => Promise<void>;
    readonly now?: () => number;
  }) {
    this.#stream = options.stream;
    this.#parseJson = options.parseJson;
    this.#limits = options.limits;
    this.#nextSequence = options.nextSequence;
    this.#onRecord = options.onRecord;
    this.#now = options.now ?? (() => performance.now());
  }

  async push(chunk: Uint8Array): Promise<void> {
    this.#pending = Buffer.concat([this.#pending, Buffer.from(chunk)]);
    let newline = this.#pending.indexOf(0x0a);
    while (newline >= 0) {
      const line = this.#pending.subarray(0, newline);
      this.#pending = this.#pending.subarray(newline + 1);
      await this.emit(line, newline + 1);
      newline = this.#pending.indexOf(0x0a);
    }
  }

  async finish(): Promise<void> {
    if (this.#pending.byteLength === 0) return;
    const line = this.#pending;
    this.#pending = Buffer.alloc(0);
    await this.emit(line, line.byteLength);
  }

  private async emit(lineWithPossibleCr: Buffer, consumedBytes: number) {
    const start = this.#offset;
    this.#offset += consumedBytes;
    if (lineWithPossibleCr.byteLength === 0) return;
    this.#recordCount += 1;
    if (this.#recordCount > this.#limits.maxRecords) {
      if (!this.#recordLimitReported) {
        this.#recordLimitReported = true;
        await this.#onRecord({
          sequence: this.#nextSequence(),
          stream: this.#stream,
          byteStart: start,
          byteEnd: start + consumedBytes,
          receivedMonotonicMs: this.#now(),
          text: "",
          parseError: "record_limit",
          sensitivity: ["credential-risk"],
        });
      }
      return;
    }
    const line =
      lineWithPossibleCr.at(-1) === 0x0d
        ? lineWithPossibleCr.subarray(0, -1)
        : lineWithPossibleCr;
    const oversized = line.byteLength > this.#limits.maxRecordBytes;
    const retained = oversized
      ? line.subarray(0, this.#limits.maxRecordBytes)
      : line;
    const text = retained.toString("utf8");
    let parsed: JsonValue | undefined;
    let parseError: RawRecord["parseError"];
    if (oversized) parseError = "record_too_large";
    else if (this.#parseJson) {
      try {
        const candidate: unknown = JSON.parse(text);
        if (!isJsonValue(candidate)) parseError = "malformed_json";
        else if (jsonDepth(candidate) > this.#limits.maxJsonDepth)
          parseError = "json_too_deep";
        else parsed = candidate;
      } catch {
        parseError = "malformed_json";
      }
    }
    const type = parsed === undefined ? undefined : vendorType(parsed);
    const record: RawRecord = {
      sequence: this.#nextSequence(),
      stream: this.#stream,
      byteStart: start,
      byteEnd: start + consumedBytes,
      receivedMonotonicMs: this.#now(),
      text,
      ...(parsed === undefined ? {} : { parsed }),
      ...(type === undefined
        ? this.#parseJson
          ? {}
          : { vendorType: "stderr" }
        : { vendorType: type }),
      ...(parseError === undefined ? {} : { parseError }),
      sensitivity: ["prompt", "source-code", "local-path", "credential-risk"],
    };
    await this.#onRecord(record);
  }
}
