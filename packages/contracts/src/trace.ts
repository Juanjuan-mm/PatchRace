import type { JsonValue, TrialId } from "./canonical.js";

export type TraceAvailability =
  "observed" | "derived" | "unavailable" | "redacted";

export interface ContentRef {
  readonly path: string;
  readonly hash?: `sha256:${string}`;
  readonly byteStart?: number;
  readonly byteEnd?: number;
  readonly record?: number;
}

export interface TraceEventV1 {
  readonly schemaVersion: "1.0.0";
  readonly eventId: string;
  readonly sequence: number;
  readonly trialId: TrialId;
  readonly parentEventId?: string;
  readonly type: string;
  readonly time: {
    readonly wall: string | null;
    readonly monotonicMs: number | null;
    readonly durationMs?: number;
    readonly precision: "millisecond" | "unknown";
  };
  readonly actor: "agent" | "controller" | "tool";
  readonly source: {
    readonly adapter: "pi" | "claude-code" | "codex";
    readonly adapterVersion: string;
    readonly vendorType?: string;
    readonly rawRef?: ContentRef;
    readonly derivedRule?: string;
    readonly inputEventIds?: readonly string[];
  };
  readonly availability: TraceAvailability;
  readonly data: Readonly<Record<string, JsonValue>>;
  readonly sensitivity: readonly string[];
}

const nullableNumber = { type: ["number", "null"] } as const;
const nullableString = { type: ["string", "null"] } as const;

export const traceEventV1Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://patchrace.dev/schemas/trace-event-v1.json",
  title: "PatchRace normalized observable trace event v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventId",
    "sequence",
    "trialId",
    "type",
    "time",
    "actor",
    "source",
    "availability",
    "data",
    "sensitivity",
  ],
  properties: {
    schemaVersion: { const: "1.0.0" },
    eventId: { type: "string", minLength: 1 },
    sequence: { type: "integer", minimum: 1 },
    trialId: {
      type: "string",
      pattern: "^trial_[0-9A-HJKMNP-TV-Z]{26}$",
    },
    parentEventId: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    time: {
      type: "object",
      additionalProperties: false,
      required: ["wall", "monotonicMs", "precision"],
      properties: {
        wall: nullableString,
        monotonicMs: nullableNumber,
        durationMs: { type: "number", minimum: 0 },
        precision: { enum: ["millisecond", "unknown"] },
      },
    },
    actor: { enum: ["agent", "controller", "tool"] },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["adapter", "adapterVersion"],
      properties: {
        adapter: { enum: ["pi", "claude-code", "codex"] },
        adapterVersion: { type: "string", minLength: 1 },
        vendorType: { type: "string" },
        rawRef: {
          type: "object",
          additionalProperties: false,
          required: ["path"],
          properties: {
            path: { type: "string", minLength: 1 },
            hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            byteStart: { type: "integer", minimum: 0 },
            byteEnd: { type: "integer", minimum: 0 },
            record: { type: "integer", minimum: 1 },
          },
        },
        derivedRule: { type: "string", minLength: 1 },
        inputEventIds: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    availability: {
      enum: ["observed", "derived", "unavailable", "redacted"],
    },
    data: { type: "object" },
    sensitivity: { type: "array", items: { type: "string" } },
  },
} as const;
