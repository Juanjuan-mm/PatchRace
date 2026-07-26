import type {
  ContentRef,
  JsonValue,
  TraceAvailability,
  TraceEventV1,
  TrialId,
} from "@patchrace/contracts";
import type { ProcessResult } from "@patchrace/core";

export type AdapterKind = "pi" | "claude-code" | "codex";
export type Availability = TraceAvailability;
export type AdapterLifecycleState =
  | "prepared"
  | "spawning"
  | "running"
  | "completing"
  | "completed"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "budget_exhausted";

export interface ProbeInput {
  readonly executable?: string;
  /** Arguments placed before the vendor CLI arguments, for example a script path when executable is Node. */
  readonly executableArgs?: readonly string[];
  readonly cwd?: string;
  readonly inheritEnvironment?: readonly string[];
  /** Values are scoped to probes and are never returned in probe results. */
  readonly environment?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface ProbeResult {
  readonly availability: "ready" | "degraded" | "unavailable";
  readonly executable: {
    readonly requested: string;
    readonly resolvedPathHash?: `sha256:${string}`;
    readonly exists: boolean;
  };
  readonly version: {
    readonly raw: string | null;
    readonly normalized: string | null;
    readonly supported: boolean;
    readonly range: string;
  };
  readonly auth: {
    readonly state: "ready" | "missing" | "expired" | "unknown";
    readonly method?: string;
    readonly detail?: string;
  };
  readonly capabilities: AdapterCapabilities;
  readonly limitations: readonly string[];
  readonly remediation: readonly string[];
}

export interface AdapterCapabilities {
  readonly headless: boolean;
  readonly structuredStream: boolean;
  readonly sessionPersistence: boolean;
  readonly cancellation: "signal" | "protocol" | "both" | "unknown";
  readonly fileEvents: Availability;
  readonly commandEvents: Availability;
  readonly editEvents: Availability;
  readonly tokenUsage: Availability;
  readonly costUsage: Availability;
  readonly modelIdentity: Availability;
  readonly sandboxModes: readonly string[];
  readonly approvalModes: readonly string[];
}

export interface AdapterBudgetInput {
  readonly wallMs?: number;
  readonly maxOutputBytes?: number;
  readonly maxRecords?: number;
  readonly maxRecordBytes?: number;
  readonly maxJsonDepth?: number;
  readonly terminationGraceMs?: number;
}

export interface PrepareInput {
  readonly executable?: string;
  /** Arguments placed before the vendor CLI arguments. */
  readonly executableArgs?: readonly string[];
  readonly trialId: TrialId;
  readonly taskHash: `sha256:${string}`;
  readonly variantHash: `sha256:${string}`;
  readonly worktree: string;
  readonly instruction: string;
  readonly resourceRoot?: string;
  readonly sessionRoot?: string;
  readonly model?: string;
  readonly sandboxMode?: "read-only" | "workspace-write";
  readonly approvalMode?: "never" | "on-request";
  readonly inheritEnvironment?: readonly string[];
  /** Credential values may be supplied here but are never copied to provenance. */
  readonly environment?: Readonly<Record<string, string>>;
  readonly budgets?: AdapterBudgetInput;
  readonly resourcePolicy?: {
    readonly extensions?: boolean;
    readonly skills?: boolean;
    readonly promptTemplates?: boolean;
    readonly contextFiles?: boolean;
  };
  readonly persistSession?: boolean;
}

export interface PreparedInvocation {
  readonly invocationId: string;
  readonly adapter: AdapterKind;
  readonly adapterVersion: string;
  readonly executionMode: "cli" | "sdk";
  readonly trialId: TrialId;
  readonly taskHash: `sha256:${string}`;
  readonly variantHash: `sha256:${string}`;
  readonly executable: string;
  /** Number of execution-only prefix arguments at the start of args. */
  readonly executableArgumentCount: number;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly instructionHash: `sha256:${string}`;
  readonly resourceRoot?: string;
  readonly sessionRoot?: string;
  readonly model?: string;
  readonly sandboxMode: "read-only" | "workspace-write";
  readonly approvalMode: "never" | "on-request";
  readonly inheritEnvironment: readonly string[];
  /** Internal execution-only values. Never serialize this field as provenance. */
  readonly environment: Readonly<Record<string, string>>;
  readonly environmentNames: readonly string[];
  readonly budgets: Required<AdapterBudgetInput>;
  readonly limitations: readonly string[];
}

export interface RawRecord {
  readonly sequence: number;
  readonly stream: "stdout" | "stderr" | "sdk";
  readonly byteStart: number;
  readonly byteEnd: number;
  readonly receivedMonotonicMs: number;
  readonly text: string;
  readonly parsed?: JsonValue;
  readonly vendorType?: string;
  readonly parseError?:
    "malformed_json" | "record_too_large" | "json_too_deep" | "record_limit";
  readonly sensitivity: readonly (
    "prompt" | "source-code" | "local-path" | "credential-risk"
  )[];
}

export interface AdapterSink {
  /** Raw bytes must durably land here before their decoded records are delivered. */
  persistChunk(stream: "stdout" | "stderr", chunk: Uint8Array): Promise<void>;
  persistRecord(record: RawRecord): Promise<void>;
}

export type AdapterErrorCategory =
  | "executable_missing"
  | "unsupported_version"
  | "auth_unavailable"
  | "invalid_invocation"
  | "permission_denied"
  | "protocol_error"
  | "malformed_output"
  | "agent_error"
  | "timeout"
  | "cancelled"
  | "budget_exhausted"
  | "resource_exhausted"
  | "network_or_vendor"
  | "unknown";

export interface AdapterError {
  readonly code: string;
  readonly category: AdapterErrorCategory;
  readonly message: string;
  readonly vendorCode?: string;
  readonly rawRef?: ContentRef;
  readonly retryable: "yes" | "no" | "unknown";
  readonly remediation?: string;
}

export interface AdapterMetrics {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningOutputTokens: number | null;
  readonly totalTokens: number | null;
  readonly cost: { readonly amount: number; readonly currency: string } | null;
  readonly turns: number | null;
  readonly toolCalls: number | null;
  readonly model: string | null;
  readonly vendorDurationMs: number | null;
  readonly controllerDurationMs: number;
}

export interface AdapterResult {
  readonly invocationId: string;
  readonly status: "completed" | "failed" | "cancelled" | "budget_exhausted";
  readonly process: ProcessResult | null;
  readonly records: readonly RawRecord[];
  readonly metrics: AdapterMetrics;
  readonly errors: readonly AdapterError[];
  readonly sessionRefs: readonly string[];
  readonly lifecycle: readonly {
    readonly state: AdapterLifecycleState;
    readonly monotonicMs: number;
  }[];
}

export interface RunningHandle {
  readonly invocationId: string;
}

export type CancelReason = "user" | "timeout" | "budget" | "shutdown";
export interface CancelResult {
  readonly invocationId: string;
  readonly status: "requested" | "already_requested" | "not_running";
  readonly reason: CancelReason;
}

export interface NormalizeContext {
  readonly trialId: TrialId;
  readonly rawPath?: string;
  readonly now?: () => Date;
}

export interface AgentAdapter {
  readonly id: string;
  readonly kind: AdapterKind;
  readonly contractVersion: "1.0.0";
  readonly adapterVersion: string;
  probe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult>;
  prepare(
    input: PrepareInput,
    signal: AbortSignal,
  ): Promise<PreparedInvocation>;
  run(
    input: PreparedInvocation,
    sink: AdapterSink,
    signal: AbortSignal,
  ): Promise<AdapterResult>;
  cancel(handle: RunningHandle, reason: CancelReason): Promise<CancelResult>;
  normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1>;
}

export function emptyMetrics(controllerDurationMs = 0): AdapterMetrics {
  return {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    totalTokens: null,
    cost: null,
    turns: null,
    toolCalls: null,
    model: null,
    vendorDurationMs: null,
    controllerDurationMs,
  };
}

export type { ContentRef, TraceEventV1 } from "@patchrace/contracts";
