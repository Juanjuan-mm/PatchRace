# Agent Adapter Contract

Status: current v0.1 contract
Last updated: 2026-07-22

## Contract boundary

An adapter translates one official, locally installed agent interface into PatchRace lifecycle, raw artifacts, normalized observable events, and metrics. It does not grade, infer unsupported behavior, extract credentials, mutate global agent state, or hide version differences.

The preferred v0.1 paths are Pi JSON/RPC or SDK, Claude Code print `stream-json`, and Codex `exec --json`. App-server protocols may be evaluated later but do not replace a stable supported CLI path without compatibility evidence.

## Testable interface

```ts
type AdapterKind = "pi" | "claude-code" | "codex";

interface AgentAdapter {
  readonly id: string;
  readonly contractVersion: "1.0.0";
  probe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult>;
  prepare(input: PrepareInput, signal: AbortSignal): Promise<PreparedInvocation>;
  run(input: PreparedInvocation, sink: AdapterSink, signal: AbortSignal): Promise<AdapterResult>;
  cancel(handle: RunningHandle, reason: CancelReason): Promise<CancelResult>;
  normalize(raw: AsyncIterable<RawRecord>, context: NormalizeContext): AsyncIterable<TraceEventV1>;
}
```

`prepare` is pure with respect to agent execution: it validates paths/capabilities and produces argv/environment-name policy plus content hashes. Only `run` spawns. `AdapterSink` persists raw stdout/stderr/vendor records before parser/normalizer delivery and applies backpressure/size limits.

## Capability discovery

`ProbeResult` contains:

```ts
interface ProbeResult {
  availability: "ready" | "degraded" | "unavailable";
  executable: { requested: string; resolvedPathHash?: string; exists: boolean };
  version: { raw: string | null; normalized: string | null; supported: boolean; range: string };
  auth: { state: "ready" | "missing" | "expired" | "unknown"; method?: string; detail?: string };
  capabilities: {
    headless: boolean; structuredStream: boolean; sessionPersistence: boolean;
    cancellation: "signal" | "protocol" | "both" | "unknown";
    fileEvents: Availability; commandEvents: Availability; editEvents: Availability;
    tokenUsage: Availability; costUsage: Availability; modelIdentity: Availability;
    sandboxModes: string[]; approvalModes: string[];
  };
  limitations: string[];
  remediation: string[];
}
```

Probe commands must be documented non-mutating version/help/status operations. Auth probes use vendor status commands or an official SDK check and record readiness only. PatchRace never reads token files, keychain entries, token values, or login cookies. When no reliable status exists, auth is `unknown` and a minimal invocation preflight establishes readiness.

## Invocation

`PrepareInput` includes frozen task/variant hashes, canonical owned worktree, exact instruction bytes, resource staging root, run-relative session/artifact destinations, budgets, requested sandbox/approval mode, model, and environment variable names.

Prepared argv is an array and must:

- select non-interactive structured output;
- set cwd/worktree explicitly;
- isolate project resources and session output where the agent supports it;
- disable unrelated/global resources only when supported and declared by the variant;
- select the least authority compatible with required edits;
- avoid dangerous bypass flags unless the user declared an externally hardened environment and the variant identity records it;
- never place credential values in argv, logs, manifests, or normalized output.

Only the recorded worktree and adapter-specific temporary/session root may be writable by PatchRace policy. Vendor sandbox behavior is a reported capability, not assumed host containment.

## Streaming and backpressure

stdout and stderr are separate byte streams. Raw bytes are persisted first. Structured stdout is parsed as JSON/JSONL with maximum line, depth, record-count, and total-byte limits. Empty/malformed/unknown records are retained and yield normalized parser errors without terminating other trials.

Adapter lifecycle emitted to the controller:

```text
prepared → spawning → running → completing → completed
                       ↘ cancelling → cancelled
                 any state ↘ failed | budget_exhausted
```

Each raw record has source stream, byte offsets, receive monotonic time, vendor type/ID if parseable, and redaction sensitivity. Normalization follows `TRACE_SCHEMA.md` and may be re-run from raw artifacts with a newer mapper as a derived view.

## Cancellation

The runner spawns a dedicated process group/session where the platform supports it and records ownership. Cancellation is idempotent:

1. stop accepting new input and mark `cancelling`;
2. use an official protocol interrupt when available;
3. signal only the recorded process group with `SIGTERM` (or platform equivalent);
4. continue draining streams during a bounded grace period;
5. if still owned/alive, send `SIGKILL` only to that group;
6. await exit/stream closure, finalize partial logs/session references, and return `cancelled` with signals/timing.

PID reuse, ownership uncertainty, or inability to enumerate descendants causes fail-safe retention and a manual recovery warning; PatchRace does not kill by executable name. Repeated cancel calls return the same terminal result.

## Version detection and compatibility

Adapters parse a bounded version command output and retain raw text. Supported ranges are explicit and fixture-tested. Unknown/newer versions default to refusal or declared degraded mode; they never silently claim complete event mapping. Each run records executable path hash, normalized/raw version, adapter version, selected mode/flags, and compatibility limitations.

## Auth behavior

- Pi: official `ModelRuntime.checkAuth`/available-model behavior or minimal isolated invocation; project-specific `PI_CODING_AGENT_DIR` may be used without copying global auth.
- Claude Code: `claude auth status` when reliable or minimal `-p` invocation; saved local auth is reused by the CLI. `--bare` changes auth behavior and is a distinct declared mode.
- Codex: `codex login status` or minimal `codex exec`; saved CLI auth is reused. API keys, if explicitly configured for automation, are scoped to that single invocation and never exposed to repository setup/grader processes.

Missing/expired auth is a preflight result with the vendor's normal login remediation; PatchRace does not automate browser login.

## Metrics

Adapters emit only vendor-exposed values with source record references. Common dimensions: input/cached/output/reasoning tokens, turns, tool calls, wall duration, model/provider ID, and cost/currency. Controller duration is independently derived. Cost unavailable under subscription or absent output remains unavailable. Token taxonomies that differ are preserved before any declared aggregation.

## Error normalization

```ts
type AdapterErrorCategory =
  | "executable_missing" | "unsupported_version" | "auth_unavailable"
  | "invalid_invocation" | "permission_denied" | "protocol_error"
  | "malformed_output" | "agent_error" | "timeout" | "cancelled"
  | "budget_exhausted" | "resource_exhausted" | "network_or_vendor"
  | "unknown";

interface AdapterError {
  code: string;
  category: AdapterErrorCategory;
  message: string;
  vendorCode?: string;
  rawRef?: ContentRef;
  retryable: "yes" | "no" | "unknown";
  remediation?: string;
}
```

Classification uses exit status, signal, structured terminal event, stderr signatures tied to supported versions, and controller cause. Agent task failure is not an adapter error. User cancellation wins over incidental non-zero exit after the cancel boundary. Unknown errors retain raw evidence and are not retried automatically.

## Current command profiles to prove in spikes

| Adapter | Headless structured path | Session/resource isolation | Cancellation |
|---|---|---|---|
| Pi | `pi --mode json ...` and `pi --mode rpc`; SDK `createAgentSession` | `PI_CODING_AGENT_DIR`, `--session-dir`, explicit resource flags | RPC abort where used plus owned process-group signal fallback |
| Claude Code | `claude -p --output-format stream-json --verbose ...` | exact cwd, settings/source flags, explicit tool/permission mode, session ID/persistence options | owned process-group signals; structured terminal result when emitted |
| Codex | `codex exec --json --sandbox workspace-write ...` | `-C`, optional isolated config/home strategy, `--ephemeral` when session retention is unnecessary | owned process-group signals; turn failure/completion events |

Flags are probed per installed version and may be narrowed by spike evidence. Dangerous bypass flags are not the default.

## Shared contract suite

Every adapter must pass fixtures for:

1. executable missing and malformed version output;
2. supported/unsupported version and capability report;
3. ready/missing/unknown auth without credential disclosure;
4. exact cwd/instruction/resource/model/sandbox invocation;
5. stdout/stderr streaming, JSON fragmentation, malformed/unknown/oversized records, backpressure;
6. observable file/search/command/edit/test mapping where supported and explicit unavailability elsewhere;
7. successful final result plus token/cost unknown handling;
8. agent non-zero, vendor/network error, timeout and budget stop;
9. cancellation before spawn, during run, repeated cancellation, stubborn child, and no unrelated-process termination;
10. session/artifact retention after success/interruption and secret redaction before export.

Contract fixtures snapshot raw input and normalized events but ignore nondeterministic IDs/timestamps through explicit canonicalization.

## Acceptance mapping

Capability discovery, invocation, streaming, cancellation, auth, version detection, metrics, errors, adapter-specific profiles, and a shared test suite have a concrete versioned interface.

## Implementation map

The accepted contract is implemented in `@patchrace/adapters` without a second process lifecycle:

- `base.ts` owns health/version/auth probing, pure path preparation, raw-first
  JSONL collection, shared `runProcess` integration, lifecycle states,
  cancellation, and common error normalization.
- `pi.ts`, `claude.ts`, and `codex.ts` contain only vendor command profiles, observable record mapping, metrics, and vendor-specific error classification.
- Pi's exact byte stream remains in `raw/stdout.log`. Its cumulative
  `message_update` events are omitted only from the structured-record view to
  avoid quadratic duplication; `message_end`, usage, and tool events remain
  structured and the declared raw-output ceiling still applies to every byte.
- `pi-sdk.ts` requires an isolated candidate resource root and adapts an official Pi session factory; `PiCliAdapter` is its explicit compatibility fallback.
- `compatibility.ts` is the machine-tested version/degradation matrix. PATH presence alone never establishes readiness.
- `export.ts` maps normalized traces to redacted local OpenTelemetry OTLP/JSON only after explicit opt-in; it has no transport or publication path.

The deterministic contract fixture represents all three structured protocols and
completes the same repository task. Live probe results remain environment
evidence rather than portable test assumptions.
