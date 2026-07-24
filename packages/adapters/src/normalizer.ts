import { sha256, type JsonValue } from "@patchrace/contracts";

import type {
  AdapterKind,
  Availability,
  NormalizeContext,
  RawRecord,
  TraceEventV1,
} from "./types.js";

export type EventData = Readonly<Record<string, JsonValue>>;

export class TraceBuilder {
  readonly #adapter: AdapterKind;
  readonly #adapterVersion: string;
  readonly #context: NormalizeContext;
  readonly #counts = new Map<string, number>();
  #sequence = 0;
  #rawCount = 0;
  #malformed = 0;
  #skipped = 0;
  #firstMonotonic: number | null = null;
  #lastMonotonic: number | null = null;

  constructor(
    adapter: AdapterKind,
    adapterVersion: string,
    context: NormalizeContext,
  ) {
    this.#adapter = adapter;
    this.#adapterVersion = adapterVersion;
    this.#context = context;
  }

  observe(record: RawRecord): void {
    this.#rawCount += 1;
    if (record.parseError !== undefined) this.#malformed += 1;
    this.#firstMonotonic ??= record.receivedMonotonicMs;
    this.#lastMonotonic = record.receivedMonotonicMs;
  }

  skipped(): void {
    this.#skipped += 1;
  }

  fromRaw(
    record: RawRecord,
    type: string,
    data: EventData,
    options: {
      readonly actor?: "agent" | "controller" | "tool";
      readonly availability?: Availability;
      readonly parentEventId?: string;
      readonly sensitivity?: readonly string[];
    } = {},
  ): TraceEventV1 {
    return this.create(type, data, {
      actor: options.actor ?? "agent",
      availability: options.availability ?? "observed",
      monotonicMs: record.receivedMonotonicMs,
      ...(record.vendorType === undefined
        ? {}
        : { vendorType: record.vendorType }),
      rawRecord: record.sequence,
      ...(options.parentEventId === undefined
        ? {}
        : { parentEventId: options.parentEventId }),
      sensitivity: options.sensitivity ?? record.sensitivity,
    });
  }

  derived(
    type: string,
    data: EventData,
    rule: string,
    options: {
      readonly actor?: "agent" | "controller" | "tool";
      readonly inputEventIds?: readonly string[];
      readonly sensitivity?: readonly string[];
    } = {},
  ): TraceEventV1 {
    return this.create(type, data, {
      actor: options.actor ?? "controller",
      availability: "derived",
      monotonicMs: this.#lastMonotonic,
      derivedRule: rule,
      ...(options.inputEventIds === undefined
        ? {}
        : { inputEventIds: options.inputEventIds }),
      sensitivity: options.sensitivity ?? [],
    });
  }

  unavailable(capability: string, reason: string): TraceEventV1 {
    return this.derived(
      "capability.unavailable",
      { capability, reason },
      `${this.#adapter}.compatibility-matrix`,
    );
  }

  parserError(record: RawRecord): TraceEventV1 {
    return this.fromRaw(
      record,
      "error.observed",
      {
        code: `ADAPTER_${(record.parseError ?? "malformed_json").toUpperCase()}`,
        category: "malformed_output",
        retryable: "unknown",
      },
      { actor: "controller", sensitivity: ["credential-risk"] },
    );
  }

  summary(limitations: readonly string[]): TraceEventV1 {
    const counts = Object.fromEntries(
      [...this.#counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ) as Record<string, JsonValue>;
    return this.derived(
      "trace.summary",
      {
        rawRecordCount: this.#rawCount,
        normalizedCountByType: counts,
        malformedCount: this.#malformed,
        skippedCount: this.#skipped,
        redactedCount: 0,
        mapperVersion: this.#adapterVersion,
        knownUnsupportedCapabilities: [...limitations],
        firstMonotonicMs: this.#firstMonotonic,
        lastMonotonicMs: this.#lastMonotonic,
        completeness: this.#malformed === 0 ? "complete" : "partial",
      },
      `${this.#adapter}.trace-summary-v1`,
    );
  }

  private create(
    type: string,
    data: EventData,
    options: {
      readonly actor: "agent" | "controller" | "tool";
      readonly availability: Availability;
      readonly monotonicMs: number | null;
      readonly vendorType?: string;
      readonly rawRecord?: number;
      readonly parentEventId?: string;
      readonly derivedRule?: string;
      readonly inputEventIds?: readonly string[];
      readonly sensitivity: readonly string[];
    },
  ): TraceEventV1 {
    this.#sequence += 1;
    const eventId = `evt_${sha256(`${this.#context.trialId}:${this.#adapter}:${this.#sequence}:${type}`).slice(7, 33)}`;
    this.#counts.set(type, (this.#counts.get(type) ?? 0) + 1);
    return {
      schemaVersion: "1.0.0",
      eventId,
      sequence: this.#sequence,
      trialId: this.#context.trialId,
      ...(options.parentEventId === undefined
        ? {}
        : { parentEventId: options.parentEventId }),
      type,
      time: {
        wall: null,
        monotonicMs: options.monotonicMs,
        precision: options.monotonicMs === null ? "unknown" : "millisecond",
      },
      actor: options.actor,
      source: {
        adapter: this.#adapter,
        adapterVersion: this.#adapterVersion,
        ...(options.vendorType === undefined
          ? {}
          : { vendorType: options.vendorType }),
        ...(options.rawRecord === undefined
          ? {}
          : {
              rawRef: {
                path: this.#context.rawPath ?? "raw/records.jsonl",
                record: options.rawRecord,
              },
            }),
        ...(options.derivedRule === undefined
          ? {}
          : { derivedRule: options.derivedRule }),
        ...(options.inputEventIds === undefined
          ? {}
          : { inputEventIds: options.inputEventIds }),
      },
      availability: options.availability,
      data,
      sensitivity: options.sensitivity,
    };
  }
}

export function jsonObject(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | null {
  return value !== undefined &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object"
    ? (value as Readonly<Record<string, JsonValue>>)
    : null;
}

export function jsonString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function jsonNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function jsonBoolean(value: JsonValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function sumKnown(...values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0
    ? null
    : known.reduce((sum, value) => sum + value, 0);
}
