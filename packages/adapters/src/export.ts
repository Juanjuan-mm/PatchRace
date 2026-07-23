import { open } from "node:fs/promises";
import { dirname } from "node:path";

import { canonicalJson, sha256, type JsonValue } from "@patchrace/contracts";
import {
  assertSafeRoot,
  ensureOwnedDirectory,
  resolveOwnedPath,
  type Redactor,
  type RedactionFinding,
} from "@patchrace/core";

import type { TraceEventV1 } from "./types.js";

interface OtlpAnyValue {
  readonly stringValue?: string;
  readonly intValue?: string;
  readonly boolValue?: boolean;
}

interface OtlpAttribute {
  readonly key: string;
  readonly value: OtlpAnyValue;
}

function attribute(
  key: string,
  value: string | number | boolean,
): OtlpAttribute {
  return {
    key,
    value:
      typeof value === "string"
        ? { stringValue: value }
        : typeof value === "boolean"
          ? { boolValue: value }
          : { intValue: String(value) },
  };
}

function hexHash(value: string, length: number): string {
  return sha256(value).slice(7, 7 + length);
}

export function createOtlpJsonTrace(
  events: readonly TraceEventV1[],
  options: {
    readonly optIn: "confirmed";
    readonly redactor: Redactor;
  },
): JsonValue {
  if (options.optIn !== "confirmed")
    throw new TypeError(
      "Standard trace export requires explicit opt-in confirmation.",
    );
  const groups = new Map<string, TraceEventV1[]>();
  for (const event of events) {
    const group = groups.get(event.trialId) ?? [];
    group.push(event);
    groups.set(event.trialId, group);
  }
  const resourceSpans = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([trialId, trialEvents]) => {
      const sorted = [...trialEvents].sort(
        (left, right) => left.sequence - right.sequence,
      );
      const adapter = sorted[0]?.source.adapter ?? "unknown";
      const adapterVersion = sorted[0]?.source.adapterVersion ?? "unknown";
      return {
        resource: {
          attributes: [
            attribute("service.name", "patchrace"),
            attribute("patchrace.schema.version", "1.0.0"),
            attribute("patchrace.export.redacted", true),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "@patchrace/adapters", version: adapterVersion },
            spans: [
              {
                traceId: hexHash(trialId, 32),
                spanId: hexHash(`${trialId}:adapter`, 16),
                name: `patchrace.adapter.${adapter}`,
                kind: 1,
                attributes: [
                  attribute("patchrace.trial.id", trialId),
                  attribute("patchrace.adapter", adapter),
                  attribute(
                    "patchrace.export.limitation",
                    "Timestamps absent from normalized evidence remain absent; no vendor fields are fabricated.",
                  ),
                ],
                events: sorted.map((event) => ({
                  name: event.type,
                  ...(event.time.wall === null
                    ? {}
                    : {
                        timeUnixNano: (
                          BigInt(new Date(event.time.wall).getTime()) *
                          1_000_000n
                        ).toString(),
                      }),
                  attributes: [
                    attribute("patchrace.event.id", event.eventId),
                    attribute("patchrace.event.sequence", event.sequence),
                    attribute("patchrace.event.actor", event.actor),
                    attribute(
                      "patchrace.event.availability",
                      event.availability,
                    ),
                    attribute(
                      "patchrace.event.data",
                      canonicalJson(
                        options.redactor.redactValue(event.data) as JsonValue,
                      ),
                    ),
                    attribute(
                      "patchrace.event.sensitivity",
                      event.sensitivity.join(","),
                    ),
                    attribute(
                      "patchrace.export.redaction.limitation",
                      "Configured redaction was applied; absence of unknown secrets is not guaranteed.",
                    ),
                  ],
                })),
              },
            ],
          },
        ],
      };
    });
  return options.redactor.redactValue({ resourceSpans }) as JsonValue;
}

export interface OtlpTraceExportResult {
  readonly logicalPath: string;
  readonly hash: `sha256:${string}`;
  readonly size: number;
  readonly findings: readonly RedactionFinding[];
  readonly published: false;
}

export async function writeOtlpJsonTraceExport(options: {
  readonly exportRoot: string;
  readonly logicalPath: string;
  readonly events: readonly TraceEventV1[];
  readonly optIn: "confirmed";
  readonly redactor: Redactor;
}): Promise<OtlpTraceExportResult> {
  const exportRoot = assertSafeRoot(options.exportRoot, "exportRoot");
  const target = resolveOwnedPath(exportRoot, options.logicalPath);
  await ensureOwnedDirectory(exportRoot, dirname(options.logicalPath));
  const value = createOtlpJsonTrace(options.events, {
    optIn: options.optIn,
    redactor: options.redactor,
  });
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  const handle = await open(target, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {
    logicalPath: options.logicalPath,
    hash: sha256(bytes),
    size: bytes.byteLength,
    findings: options.redactor.findings(),
    published: false,
  };
}
