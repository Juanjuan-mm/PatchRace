import {
  PatchRaceError,
  canonicalJson,
  type JsonValue,
} from "@patchrace/contracts";

import { PiCliAdapter } from "./pi.js";
import {
  emptyMetrics,
  type AdapterError,
  type AdapterMetrics,
  type AdapterResult,
  type AdapterSink,
  type AgentAdapter,
  type CancelReason,
  type CancelResult,
  type NormalizeContext,
  type PrepareInput,
  type PreparedInvocation,
  type ProbeInput,
  type ProbeResult,
  type RawRecord,
  type RunningHandle,
  type TraceEventV1,
} from "./types.js";

export interface PiSdkSession {
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(instruction: string): Promise<void>;
  abort?(): void | Promise<void>;
  dispose(): void;
  readonly sessionRef?: string;
}

export interface PiSdkSessionFactory {
  createSession(input: {
    readonly cwd: string;
    readonly agentDir: string;
    readonly sessionRoot?: string;
    readonly model?: string;
  }): Promise<PiSdkSession>;
}

export interface PiSdkRuntimeResult {
  readonly metrics?: Partial<AdapterMetrics>;
  readonly sessionRefs?: readonly string[];
}

export interface PiSdkRuntime {
  run(
    input: PreparedInvocation,
    emit: (event: JsonValue) => Promise<void>,
    signal: AbortSignal,
  ): Promise<PiSdkRuntimeResult>;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function copyJson(value: unknown): JsonValue {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonValue(parsed))
    throw new TypeError("Pi SDK emitted a non-JSON event.");
  return parsed;
}

export function createPiSdkRuntime(factory: PiSdkSessionFactory): PiSdkRuntime {
  return {
    async run(input, emit, signal) {
      if (input.resourceRoot === undefined)
        throw new TypeError(
          "Pi SDK execution requires an isolated resource root.",
        );
      const session = await factory.createSession({
        cwd: input.cwd,
        agentDir: input.resourceRoot,
        ...(input.sessionRoot === undefined
          ? {}
          : { sessionRoot: input.sessionRoot }),
        ...(input.model === undefined ? {} : { model: input.model }),
      });
      let chain = Promise.resolve();
      const unsubscribe = session.subscribe((event) => {
        chain = chain.then(() => emit(copyJson(event)));
      });
      const abort = (): void => {
        void session.abort?.();
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      try {
        await session.prompt(input.args.at(-1) ?? "");
        await chain;
        return {
          ...(session.sessionRef === undefined
            ? {}
            : { sessionRefs: [session.sessionRef] }),
        };
      } finally {
        signal.removeEventListener("abort", abort);
        unsubscribe();
        session.dispose();
      }
    },
  };
}

export class PiSdkAdapter implements AgentAdapter {
  readonly id = "patchrace.pi.sdk";
  readonly kind = "pi" as const;
  readonly contractVersion = "1.0.0" as const;
  readonly adapterVersion = "0.1.0";
  readonly #cli = new PiCliAdapter();
  readonly #runtime: PiSdkRuntime;
  readonly #running = new Map<string, AbortController>();
  readonly #cancelled = new Map<string, CancelReason>();

  constructor(runtime: PiSdkRuntime) {
    this.#runtime = runtime;
  }

  async probe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult> {
    const result = await this.#cli.probe(input, signal);
    return {
      ...result,
      capabilities: {
        ...result.capabilities,
        cancellation: "both",
        sessionPersistence: true,
      },
      limitations: [
        ...result.limitations,
        "SDK compatibility is supplied by the injected official Pi session factory; CLI JSON is the documented fallback.",
      ],
    };
  }

  async prepare(
    input: PrepareInput,
    signal: AbortSignal,
  ): Promise<PreparedInvocation> {
    if (input.resourceRoot === undefined)
      throw new PatchRaceError({
        code: "PI_SDK_RESOURCE_ROOT_REQUIRED",
        category: "CONFIG",
        message:
          "Pi SDK preparation requires resourceRoot for candidate isolation.",
        path: "resourceRoot",
      });
    const prepared = await this.#cli.prepare(input, signal);
    return {
      ...prepared,
      executionMode: "sdk",
      executable: "[pi-sdk]",
      limitations: [
        ...prepared.limitations,
        "Falls back to Pi CLI JSON when the official SDK bridge cannot be loaded.",
      ],
    };
  }

  async run(
    input: PreparedInvocation,
    sink: AdapterSink,
    signal: AbortSignal,
  ): Promise<AdapterResult> {
    if (input.executionMode !== "sdk" || input.adapter !== "pi")
      throw new PatchRaceError({
        code: "PI_SDK_INVOCATION_MISMATCH",
        category: "CONFIG",
        message: "Prepared invocation does not belong to the Pi SDK adapter.",
        path: "adapter",
      });
    const started = performance.now();
    const lifecycle: {
      state: AdapterResult["lifecycle"][number]["state"];
      monotonicMs: number;
    }[] = [
      { state: "prepared", monotonicMs: 0 },
      { state: "spawning", monotonicMs: 0 },
    ];
    const controller = new AbortController();
    const externalAbort = (): void => controller.abort(signal.reason);
    signal.addEventListener("abort", externalAbort, { once: true });
    if (signal.aborted) externalAbort();
    this.#running.set(input.invocationId, controller);
    lifecycle.push({
      state: "running",
      monotonicMs: performance.now() - started,
    });
    const records: RawRecord[] = [];
    let sequence = 0;
    let byteOffset = 0;
    let runtimeResult: PiSdkRuntimeResult = {};
    const errors: AdapterError[] = [];
    try {
      runtimeResult = await this.#runtime.run(
        input,
        async (event) => {
          const text = canonicalJson(event);
          const size = Buffer.byteLength(text) + 1;
          const eventObject =
            event !== null && !Array.isArray(event) && typeof event === "object"
              ? (event as Readonly<Record<string, JsonValue>>)
              : null;
          const type =
            typeof eventObject?.["type"] === "string"
              ? eventObject["type"]
              : undefined;
          const record: RawRecord = {
            sequence: ++sequence,
            stream: "sdk",
            byteStart: byteOffset,
            byteEnd: byteOffset + size,
            receivedMonotonicMs: performance.now() - started,
            text,
            parsed: event,
            ...(type === undefined ? {} : { vendorType: type }),
            sensitivity: [
              "prompt",
              "source-code",
              "local-path",
              "credential-risk",
            ],
          };
          byteOffset += size;
          await sink.persistRecord(record);
          records.push(record);
        },
        controller.signal,
      );
    } catch {
      errors.push({
        code: controller.signal.aborted ? "PI_SDK_CANCELLED" : "PI_SDK_ERROR",
        category: controller.signal.aborted ? "cancelled" : "agent_error",
        message: controller.signal.aborted
          ? "Pi SDK execution was cancelled."
          : "Pi SDK execution failed; the CLI JSON path is available as a fallback.",
        retryable: controller.signal.aborted ? "yes" : "unknown",
        remediation:
          "Retry through PiCliAdapter when SDK compatibility is unavailable.",
      });
    } finally {
      signal.removeEventListener("abort", externalAbort);
      this.#running.delete(input.invocationId);
    }
    const duration = Math.max(0, performance.now() - started);
    const status: AdapterResult["status"] = controller.signal.aborted
      ? "cancelled"
      : errors.length > 0
        ? "failed"
        : "completed";
    lifecycle.push({ state: "completing", monotonicMs: duration });
    lifecycle.push({ state: status, monotonicMs: duration });
    return {
      invocationId: input.invocationId,
      status,
      process: null,
      records,
      metrics: {
        ...emptyMetrics(duration),
        ...runtimeResult.metrics,
        controllerDurationMs: duration,
      },
      errors,
      sessionRefs: runtimeResult.sessionRefs ?? [],
      lifecycle,
    };
  }

  async cancel(
    handle: RunningHandle,
    reason: CancelReason,
  ): Promise<CancelResult> {
    const prior = this.#cancelled.get(handle.invocationId);
    if (prior !== undefined)
      return {
        invocationId: handle.invocationId,
        status: "already_requested",
        reason: prior,
      };
    const controller = this.#running.get(handle.invocationId);
    if (controller === undefined)
      return {
        invocationId: handle.invocationId,
        status: "not_running",
        reason,
      };
    this.#cancelled.set(handle.invocationId, reason);
    controller.abort(new Error(`Pi SDK cancellation: ${reason}`));
    return { invocationId: handle.invocationId, status: "requested", reason };
  }

  normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1> {
    return this.#cli.normalize(raw, context);
  }
}
