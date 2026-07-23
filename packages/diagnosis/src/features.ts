import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  type DiagnosticLane,
  type DiagnosticValueV1,
  type JsonValue,
  type TraceEventV1,
  type TrajectoryFeatureDeltaV1,
  type TrajectoryFeaturesV1,
} from "@patchrace/contracts";

interface LaneDeclaration {
  readonly availability: "observed" | "unavailable";
  readonly reason?: string;
}

export interface ExtractTrajectoryFeatureOptions {
  readonly runId: string;
  readonly artifactHash: `sha256:${string}`;
  readonly logicalPath: string;
  readonly events: readonly TraceEventV1[];
  readonly relevantPaths?: readonly string[];
  readonly traceCompleteness: "complete" | "partial" | "unknown";
  readonly lanes?: Partial<Record<DiagnosticLane, LaneDeclaration>>;
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

function canonicalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/, "");
  return normalized.length === 0 ? null : normalized;
}

function laneValue<T>(
  lane: DiagnosticLane,
  declaration: LaneDeclaration | undefined,
  evidence: readonly TraceEventV1[],
  value: T,
): DiagnosticValueV1<T> {
  if (evidence.length > 0 || declaration?.availability === "observed")
    return {
      value,
      availability: "derived",
      evidenceEventIds: evidence.map((event) => event.eventId),
      reason: null,
    };
  return {
    value: null,
    availability: "unavailable",
    evidenceEventIds: [],
    reason: declaration?.reason ?? `${lane}_lane_completeness_not_established`,
  };
}

function eventSignature(event: TraceEventV1): string {
  const data = event.data;
  if (event.type.startsWith("search.")) {
    return canonicalJson({
      kind: scalar(data, ["kind", "searchKind"]),
      query: scalar(data, ["query", "queryHash"]),
      scope: scalar(data, ["scope", "path", "cwd"]),
      tool: scalar(data, ["tool", "toolName"]),
    });
  }
  return canonicalJson({
    argv: data["argv"] ?? null,
    command: scalar(data, ["command", "shell", "text"]),
    cwd: scalar(data, ["cwd"]),
  });
}

function repeatedGroups(events: readonly TraceEventV1[]): readonly {
  readonly signature: string;
  readonly repetitions: number;
  readonly eventIds: readonly string[];
}[] {
  const groups = new Map<string, TraceEventV1[]>();
  for (const event of events) {
    const signature = eventSignature(event);
    const existing = groups.get(signature) ?? [];
    existing.push(event);
    groups.set(signature, existing);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([signature, group]) => ({
      signature,
      repetitions: group.length,
      eventIds: group.map((event) => event.eventId),
    }));
}

function testStatus(event: TraceEventV1): "passed" | "failed" | "unknown" {
  if (event.type === "test.failed") return "failed";
  const exitCode = scalar(event.data, ["exitCode"]);
  const status = scalar(event.data, ["status", "outcome"]);
  if (exitCode === 0 || status === "passed" || status === "success")
    return "passed";
  if (
    (typeof exitCode === "number" && exitCode !== 0) ||
    status === "failed" ||
    status === "error"
  )
    return "failed";
  return "unknown";
}

function validateEvents(
  events: readonly TraceEventV1[],
): readonly TraceEventV1[] {
  if (events.length === 0) return [];
  const trialId = events[0]!.trialId;
  const ids = new Set<string>();
  let previous = 0;
  for (const event of events) {
    if (event.trialId !== trialId)
      throw new PatchRaceError({
        code: "DIAGNOSIS_TRACE_TRIAL_MISMATCH",
        category: "CONFLICT",
        message: "Trajectory features require events from exactly one trial.",
        path: "events.trialId",
      });
    if (event.sequence <= previous || ids.has(event.eventId))
      throw new PatchRaceError({
        code: "DIAGNOSIS_TRACE_ORDER_INVALID",
        category: "CONFLICT",
        message:
          "Trajectory events must have unique IDs and strictly increasing sequence.",
        path: "events.sequence",
      });
    previous = event.sequence;
    ids.add(event.eventId);
  }
  return events;
}

export function extractTrajectoryFeatures(
  options: ExtractTrajectoryFeatureOptions,
): TrajectoryFeaturesV1 {
  const events = validateEvents(options.events);
  if (events.length === 0)
    throw new PatchRaceError({
      code: "DIAGNOSIS_TRACE_EMPTY",
      category: "CONFIG",
      message:
        "Trajectory feature extraction requires at least one trace event.",
      path: "events",
    });
  const trialId = events[0]!.trialId;
  const usable = events.filter(
    (event) =>
      event.availability === "observed" || event.availability === "derived",
  );
  const fileEvents = usable.filter(
    (event) =>
      event.type === "file.read.completed" ||
      event.type === "file.list.completed",
  );
  const relevantPaths = [
    ...new Set(
      (options.relevantPaths ?? [])
        .map(canonicalPath)
        .filter((path): path is string => path !== null),
    ),
  ].sort();
  const readPaths = new Set(
    fileEvents
      .flatMap((event) => {
        const path = canonicalPath(event.data["path"]);
        const paths = event.data["paths"];
        return [
          ...(path === null ? [] : [path]),
          ...(Array.isArray(paths)
            ? paths
                .map(canonicalPath)
                .filter((item): item is string => item !== null)
            : []),
        ];
      })
      .filter((path) => relevantPaths.includes(path)),
  );
  const fileCoverage =
    relevantPaths.length === 0
      ? {
          value: null,
          availability: "unavailable" as const,
          evidenceEventIds: [],
          reason: "relevant_paths_not_declared",
        }
      : laneValue("file", options.lanes?.file, fileEvents, {
          relevantPathCount: relevantPaths.length,
          observedRelevantPaths: [...readPaths].sort(),
          ratio: readPaths.size / relevantPaths.length,
        });

  const searchEvents = usable.filter(
    (event) => event.type === "search.completed",
  );
  const commandEvents = usable.filter(
    (event) =>
      event.type === "command.completed" || event.type === "command.failed",
  );
  const failedCommands = commandEvents.filter((event) => {
    const exitCode = scalar(event.data, ["exitCode"]);
    const status = scalar(event.data, ["status", "outcome"]);
    return (
      event.type === "command.failed" ||
      (typeof exitCode === "number" && exitCode !== 0) ||
      status === "failed" ||
      status === "error"
    );
  });
  const testEvents = usable.filter(
    (event) =>
      event.type === "test.started" ||
      event.type === "test.completed" ||
      event.type === "test.failed",
  );
  const orderedTests = testEvents
    .filter(
      (event) =>
        event.type === "test.completed" || event.type === "test.failed",
    )
    .map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      type: event.type,
      status: testStatus(event),
    }));
  const firstTime = events.find((event) => event.time.monotonicMs !== null)
    ?.time.monotonicMs;
  const firstTest = testEvents.find((event) => event.time.monotonicMs !== null);
  const timeToFirstTestMs: DiagnosticValueV1<number> =
    firstTime !== undefined &&
    firstTime !== null &&
    firstTest?.time.monotonicMs !== null &&
    firstTest?.time.monotonicMs !== undefined
      ? {
          value: firstTest.time.monotonicMs - firstTime,
          availability: "derived",
          evidenceEventIds: [events[0]!.eventId, firstTest.eventId],
          reason: null,
        }
      : {
          value: null,
          availability: "unavailable",
          evidenceEventIds: [],
          reason:
            testEvents.length === 0
              ? (options.lanes?.test?.reason ??
                "test_lane_completeness_not_established")
              : "monotonic_timing_unavailable",
        };
  const editEvents = usable.filter((event) => event.type === "edit.completed");
  const editPaths = [
    ...new Set(
      editEvents
        .map((event) => canonicalPath(event.data["path"]))
        .filter((path): path is string => path !== null),
    ),
  ].sort();
  const lineDeltas = editEvents.map((event) => {
    const explicit = scalar(event.data, ["lineDelta", "changedLines"]);
    if (typeof explicit === "number") return Math.abs(explicit);
    const added = scalar(event.data, ["linesAdded", "addedLines"]);
    const removed = scalar(event.data, ["linesRemoved", "removedLines"]);
    return typeof added === "number" && typeof removed === "number"
      ? Math.abs(added) + Math.abs(removed)
      : null;
  });
  const changedLines =
    lineDeltas.length > 0 && lineDeltas.every((value) => value !== null)
      ? lineDeltas.reduce<number>(
          (total, value) => total + (value as number),
          0,
        )
      : null;
  const limitations = [
    ...(options.traceCompleteness === "complete"
      ? []
      : [`trace_${options.traceCompleteness}`]),
    ...Object.entries(options.lanes ?? {}).flatMap(([lane, value]) =>
      value.availability === "unavailable"
        ? [`${lane}_lane_unavailable:${value.reason ?? "unspecified"}`]
        : [],
    ),
  ].sort();
  return {
    schemaVersion: SCHEMA_VERSION,
    featureSchemaVersion: "1.0.0",
    trialId,
    trace: {
      runId: options.runId,
      trialId,
      artifactHash: options.artifactHash,
      logicalPath: options.logicalPath,
      eventIds: events.map((event) => event.eventId),
    },
    traceCompleteness: options.traceCompleteness,
    fileCoverage,
    searchLoops: laneValue(
      "search",
      options.lanes?.search,
      searchEvents,
      repeatedGroups(searchEvents),
    ),
    commandFailures: laneValue(
      "command",
      options.lanes?.command,
      commandEvents,
      {
        count: failedCommands.length,
        eventIds: failedCommands.map((event) => event.eventId),
      },
    ),
    timeToFirstTestMs,
    testOrder: laneValue("test", options.lanes?.test, testEvents, orderedTests),
    editFootprint: laneValue("edit", options.lanes?.edit, editEvents, {
      paths: editPaths,
      changedLines,
      eventIds: editEvents.map((event) => event.eventId),
    }),
    retries: laneValue(
      "command",
      options.lanes?.command,
      commandEvents,
      repeatedGroups(commandEvents),
    ),
    limitations,
  };
}

function delta(
  left: DiagnosticValueV1<number>,
  right: DiagnosticValueV1<number>,
): DiagnosticValueV1<number> {
  if (left.value === null || right.value === null)
    return {
      value: null,
      availability: "unavailable",
      evidenceEventIds: [...left.evidenceEventIds, ...right.evidenceEventIds],
      reason: "one_or_both_feature_values_unavailable",
    };
  return {
    value: right.value - left.value,
    availability: "derived",
    evidenceEventIds: [...left.evidenceEventIds, ...right.evidenceEventIds],
    reason: null,
  };
}

function count<T>(
  feature: DiagnosticValueV1<readonly T[]>,
): DiagnosticValueV1<number> {
  return {
    value: feature.value?.length ?? null,
    availability: feature.availability,
    evidenceEventIds: feature.evidenceEventIds,
    reason: feature.reason,
  };
}

export function diffTrajectoryFeatures(
  left: TrajectoryFeaturesV1,
  right: TrajectoryFeaturesV1,
): TrajectoryFeatureDeltaV1 {
  const coverage = (
    value: TrajectoryFeaturesV1,
  ): DiagnosticValueV1<number> => ({
    value: value.fileCoverage.value?.ratio ?? null,
    availability: value.fileCoverage.availability,
    evidenceEventIds: value.fileCoverage.evidenceEventIds,
    reason: value.fileCoverage.reason,
  });
  const commandFailureCount = (
    value: TrajectoryFeaturesV1,
  ): DiagnosticValueV1<number> => ({
    value: value.commandFailures.value?.count ?? null,
    availability: value.commandFailures.availability,
    evidenceEventIds: value.commandFailures.evidenceEventIds,
    reason: value.commandFailures.reason,
  });
  const editPathCount = (
    value: TrajectoryFeaturesV1,
  ): DiagnosticValueV1<number> => ({
    value: value.editFootprint.value?.paths.length ?? null,
    availability: value.editFootprint.availability,
    evidenceEventIds: value.editFootprint.evidenceEventIds,
    reason: value.editFootprint.reason,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    leftTrialId: left.trialId,
    rightTrialId: right.trialId,
    deltas: {
      fileCoverageRatio: delta(coverage(left), coverage(right)),
      searchLoopCount: delta(count(left.searchLoops), count(right.searchLoops)),
      commandFailureCount: delta(
        commandFailureCount(left),
        commandFailureCount(right),
      ),
      timeToFirstTestMs: delta(left.timeToFirstTestMs, right.timeToFirstTestMs),
      testCount: delta(count(left.testOrder), count(right.testOrder)),
      editPathCount: delta(editPathCount(left), editPathCount(right)),
      retryCount: delta(count(left.retries), count(right.retries)),
    },
    convention: "right-minus-left",
  };
}
