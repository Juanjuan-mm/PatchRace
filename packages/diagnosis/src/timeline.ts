import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  type JsonValue,
  type TraceEventV1,
  type TrajectoryLane,
  type TrajectoryTimelineV1,
} from "@patchrace/contracts";

const lanes: readonly TrajectoryLane[] = [
  "file",
  "search",
  "command",
  "edit",
  "test",
  "error",
];

function lane(type: string): TrajectoryLane | null {
  if (type.startsWith("file.")) return "file";
  if (type.startsWith("search.")) return "search";
  if (type.startsWith("command.")) return "command";
  if (type.startsWith("edit.")) return "edit";
  if (type.startsWith("test.")) return "test";
  if (type === "error.observed" || type.endsWith(".failed")) return "error";
  return null;
}

function scalar(
  data: Readonly<Record<string, JsonValue>>,
  names: readonly string[],
): JsonValue | null {
  for (const name of names) {
    const value = data[name];
    if (
      value !== undefined &&
      (typeof value === "string" ||
        typeof value === "number" ||
        Array.isArray(value))
    )
      return value;
  }
  return null;
}

function key(event: TraceEventV1, eventLane: TrajectoryLane): string {
  const target = scalar(event.data, [
    "path",
    "oldPath",
    "query",
    "argv",
    "shell",
    "command",
    "suite",
    "code",
    "tool",
  ]);
  return `${eventLane}:${target === null ? event.type : canonicalJson(target)}`;
}

export function buildTrajectoryTimeline(options: {
  readonly traces: readonly {
    readonly variantId: string;
    readonly events: readonly TraceEventV1[];
  }[];
  readonly maxEvents?: number;
}): TrajectoryTimelineV1 {
  const maxEvents = options.maxEvents ?? 10_000;
  if (!Number.isInteger(maxEvents) || maxEvents < 1)
    throw new PatchRaceError({
      code: "TIMELINE_LIMIT_INVALID",
      category: "CONFIG",
      message: "Timeline event limit must be a positive integer.",
      path: "maxEvents",
    });
  const variantIds = options.traces.map((trace) => trace.variantId);
  if (new Set(variantIds).size !== variantIds.length)
    throw new PatchRaceError({
      code: "TIMELINE_VARIANT_DUPLICATE",
      category: "CONFIG",
      message: "Timeline variant IDs must be unique.",
      path: "traces",
    });
  const inputEventCount = options.traces.reduce(
    (sum, trace) => sum + trace.events.length,
    0,
  );
  const categorized = options.traces.flatMap((trace) => {
    const seen = new Set<string>();
    return [...trace.events]
      .sort((a, b) => a.sequence - b.sequence)
      .flatMap((event) => {
        if (seen.has(event.eventId))
          throw new PatchRaceError({
            code: "TIMELINE_EVENT_DUPLICATE",
            category: "CONFLICT",
            message: "Timeline contains a duplicate event ID.",
            path: event.eventId,
          });
        seen.add(event.eventId);
        const eventLane = lane(event.type);
        return eventLane === null
          ? []
          : [{ variantId: trace.variantId, event, eventLane }];
      });
  });
  const selected = categorized.slice(0, maxEvents);
  const grouped = new Map<
    string,
    {
      lane: TrajectoryLane;
      occurrences: TrajectoryTimelineV1["rows"][number]["occurrences"][number][];
    }
  >();
  for (const item of selected) {
    const alignmentKey = key(item.event, item.eventLane);
    const group = grouped.get(alignmentKey) ?? {
      lane: item.eventLane,
      occurrences: [],
    };
    group.occurrences.push({
      variantId: item.variantId,
      trialId: item.event.trialId,
      eventId: item.event.eventId,
      sequence: item.event.sequence,
      type: item.event.type,
      availability: item.event.availability,
      monotonicMs: item.event.time.monotonicMs,
      rawRef: item.event.source.rawRef ?? null,
    });
    grouped.set(alignmentKey, group);
  }
  const unavailable = options.traces.flatMap((trace) =>
    lanes.flatMap((expected) =>
      selected.some(
        (item) =>
          item.variantId === trace.variantId && item.eventLane === expected,
      )
        ? []
        : [
            {
              variantId: trace.variantId,
              lane: expected,
              reason: categorized.some(
                (item) =>
                  item.variantId === trace.variantId &&
                  item.eventLane === expected,
              )
                ? "not_retained_due_to_timeline_limit"
                : "not_exposed_in_normalized_trace",
            },
          ],
    ),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    lanes,
    rows: [...grouped.entries()].map(([alignmentKey, value]) => ({
      alignmentKey,
      lane: value.lane,
      occurrences: value.occurrences,
    })),
    unavailable,
    inputEventCount,
    retainedEventCount: selected.length,
    truncated: selected.length < categorized.length,
  };
}
