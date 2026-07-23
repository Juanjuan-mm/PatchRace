import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  type ContentRef,
  type JsonValue,
  type ObservableActionKind,
  type ObservableTrajectoryAlignmentV1,
  type TraceEventV1,
} from "@patchrace/contracts";

interface ActionAvailability {
  readonly availability: "observed" | "unavailable";
  readonly reason?: string;
}

export interface AlignObservableTrajectoriesOptions {
  readonly traces: readonly {
    readonly variantId: string;
    readonly events: readonly TraceEventV1[];
    readonly actions?: Partial<
      Record<ObservableActionKind, ActionAvailability>
    >;
  }[];
}

function scalar(
  data: Readonly<Record<string, JsonValue>>,
  keys: readonly string[],
): string | number | boolean | null {
  for (const key of keys) {
    const value = data[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
  }
  return null;
}

function path(value: unknown): string {
  return typeof value === "string"
    ? value.replaceAll("\\", "/").replace(/^\.\/+/, "")
    : "unknown";
}

function argv(event: TraceEventV1): readonly string[] {
  const value = event.data["argv"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function testCommand(arguments_: readonly string[]): boolean {
  const normalized = arguments_.map((item) => item.toLowerCase());
  return normalized.some(
    (item, index) =>
      item === "test" ||
      item === "pytest" ||
      item === "vitest" ||
      (item === "--test" && normalized[index - 1] === "node"),
  );
}

function testScope(event: TraceEventV1): string {
  const explicit = scalar(event.data, [
    "suite",
    "testPath",
    "path",
    "scope",
    "target",
  ]);
  if (explicit !== null) return path(String(explicit)).toLowerCase();
  const arguments_ = argv(event);
  const candidates = arguments_.filter(
    (item) =>
      item.includes("/") ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(item) ||
      item.endsWith(".py"),
  );
  return candidates.length === 0
    ? "all"
    : candidates
        .map((item) => path(item).toLowerCase())
        .sort()
        .join(",");
}

function commandKey(event: TraceEventV1): string {
  const arguments_ = argv(event);
  if (arguments_.length > 0) {
    const normalized = arguments_.map((item) => path(item).toLowerCase());
    if (["npm", "pnpm", "yarn", "bun"].includes(normalized[0] ?? ""))
      normalized.shift();
    return canonicalJson(normalized);
  }
  return String(scalar(event.data, ["command", "shell", "text"]) ?? "unknown")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function action(
  event: TraceEventV1,
): { readonly kind: ObservableActionKind; readonly key: string } | null {
  if (event.type === "file.read.completed")
    return {
      kind: "inspect-file",
      key: `inspect-file:${path(event.data["path"])}`,
    };
  if (event.type === "file.list.completed")
    return {
      kind: "list-files",
      key: `list-files:${path(event.data["path"] ?? event.data["base"])}`,
    };
  if (event.type === "search.completed") {
    const query = scalar(event.data, ["query", "queryHash"]);
    const scope = scalar(event.data, ["scope", "path", "cwd"]);
    return {
      kind: "search",
      key: `search:${canonicalJson({
        kind: scalar(event.data, ["kind", "searchKind"]) ?? "text",
        query: query ?? "redacted-or-unavailable",
        scope: scope === null ? "." : path(String(scope)),
      })}`,
    };
  }
  if (event.type === "test.completed" || event.type === "test.failed")
    return { kind: "run-test", key: `run-test:${testScope(event)}` };
  if (event.type === "command.completed" || event.type === "command.failed") {
    const arguments_ = argv(event);
    const declaredKind = scalar(event.data, ["kind", "commandKind"]);
    return testCommand(arguments_) || declaredKind === "test"
      ? { kind: "run-test", key: `run-test:${testScope(event)}` }
      : { kind: "run-command", key: `run-command:${commandKey(event)}` };
  }
  if (event.type === "edit.completed")
    return {
      kind: "edit-file",
      key: `edit-file:${path(event.data["path"])}`,
    };
  if (event.type === "error.observed")
    return {
      kind: "error",
      key: `error:${String(
        scalar(event.data, ["code", "category"]) ?? "unknown",
      ).toLowerCase()}`,
    };
  return null;
}

function validateTrace(
  variantId: string,
  events: readonly TraceEventV1[],
): void {
  if (events.length === 0) return;
  const trialId = events[0]!.trialId;
  let sequence = 0;
  for (const event of events) {
    if (event.trialId !== trialId || event.sequence <= sequence)
      throw new PatchRaceError({
        code: "DIAGNOSIS_ALIGNMENT_TRACE_INVALID",
        category: "CONFLICT",
        message:
          "Each aligned variant must contain one strictly ordered trial trace.",
        path: `traces.${variantId}`,
      });
    sequence = event.sequence;
  }
}

export function alignObservableTrajectories(
  options: AlignObservableTrajectoriesOptions,
): ObservableTrajectoryAlignmentV1 {
  if (
    options.traces.length < 2 ||
    new Set(options.traces.map((trace) => trace.variantId)).size !==
      options.traces.length ||
    options.traces.some((trace) => trace.events.length === 0)
  )
    throw new PatchRaceError({
      code: "DIAGNOSIS_ALIGNMENT_INPUT_INVALID",
      category: "CONFIG",
      message:
        "Cross-Agent alignment requires at least two unique variants with non-empty traces.",
      path: "traces",
    });
  for (const trace of options.traces)
    validateTrace(trace.variantId, trace.events);

  const grouped = new Map<
    string,
    {
      readonly action: ObservableActionKind;
      readonly occurrences: {
        variantId: string;
        trialId: TraceEventV1["trialId"];
        eventId: string;
        sequence: number;
        ordinal: number;
        type: string;
        availability: TraceEventV1["availability"];
        rawRef: ContentRef | null;
      }[];
    }
  >();
  const observedByVariant = new Map<string, Set<ObservableActionKind>>();
  for (const trace of options.traces) {
    const observed = new Set<ObservableActionKind>();
    let ordinal = 0;
    for (const event of trace.events) {
      if (event.availability !== "observed" && event.availability !== "derived")
        continue;
      const semantic = action(event);
      if (semantic === null) continue;
      observed.add(semantic.kind);
      const group = grouped.get(semantic.key) ?? {
        action: semantic.kind,
        occurrences: [],
      };
      group.occurrences.push({
        variantId: trace.variantId,
        trialId: event.trialId,
        eventId: event.eventId,
        sequence: event.sequence,
        ordinal: ++ordinal,
        type: event.type,
        availability: event.availability,
        rawRef: event.source.rawRef ?? null,
      });
      grouped.set(semantic.key, group);
    }
    observedByVariant.set(trace.variantId, observed);
  }
  const groups = [...grouped.entries()]
    .sort(([, left], [, right]) => {
      const leftOrdinal = Math.min(
        ...left.occurrences.map((item) => item.ordinal),
      );
      const rightOrdinal = Math.min(
        ...right.occurrences.map((item) => item.ordinal),
      );
      return leftOrdinal - rightOrdinal;
    })
    .map(([semanticKey, group]) => ({
      semanticKey,
      action: group.action,
      relation:
        new Set(group.occurrences.map((item) => item.variantId)).size > 1
          ? ("cross-variant" as const)
          : ("single-variant" as const),
      occurrences: group.occurrences.sort(
        (left, right) =>
          left.variantId.localeCompare(right.variantId) ||
          left.sequence - right.sequence,
      ),
    }));
  const unavailable = options.traces.flatMap((trace) =>
    (
      [
        "inspect-file",
        "list-files",
        "search",
        "run-test",
        "run-command",
        "edit-file",
        "error",
      ] as const
    ).flatMap((kind) => {
      if (observedByVariant.get(trace.variantId)?.has(kind) === true) return [];
      const declaration = trace.actions?.[kind];
      return declaration?.availability === "observed"
        ? []
        : [
            {
              variantId: trace.variantId,
              action: kind,
              reason:
                declaration?.reason ??
                "action_not_exposed_or_completeness_not_established",
            },
          ];
    }),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    alignmentSchemaVersion: "1.0.0",
    variants: options.traces.map((trace) => ({
      variantId: trace.variantId,
      trialId: trace.events[0]!.trialId,
    })),
    groups,
    unavailable,
    limitations: [
      "alignment_uses_only_normalized_observable_actions",
      "semantic_equivalence_does_not_imply_equal_intent_or_hidden_reasoning",
      ...(unavailable.length > 0
        ? ["one_or_more_action_lanes_unavailable"]
        : []),
    ],
  };
}
