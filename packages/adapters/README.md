# @patchrace/adapters

Versioned, local-first adapters for Pi, Claude Code, and Codex. The package
implements the `1.0.0` adapter contract: executable/version/auth probes, pure
invocation preparation, raw-first structured streaming, shared process-group
cancellation, normalized errors and metrics, observable trace mapping,
compatibility checks, and explicit redacted export.

## Supported profiles

| Adapter     | Structured command                                        | Supported versions   | Auth behavior                                                                                     |
| ----------- | --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| Pi CLI      | `pi --mode json --print ...`                              | `>=0.81.0 <0.82.0`   | Official status is unavailable, so probe reports `unknown`; invocation establishes readiness.     |
| Pi SDK      | Injected official `createAgentSession`-compatible factory | Same Pi range        | Isolated `resourceRoot` is mandatory; Pi CLI JSON is the documented fallback.                     |
| Claude Code | `claude -p ... --output-format stream-json --verbose`     | `>=2.1.104 <2.2.0`   | Uses `claude auth status`; never reads or copies stored credentials.                              |
| Codex       | `codex exec --json --sandbox ... -C ...`                  | `>=0.145.0 <0.146.0` | Uses `codex login status`; a broken PATH executable fails instead of silently switching identity. |

Exact fixture versions and known degradations are exported as `ADAPTER_COMPATIBILITY` and tested. Unknown or newer versions are not silently treated as compatible.

## Lifecycle

Call `probe`, then `prepare`, then `run`. `prepare` resolves paths and builds argv without spawning the agent. `run` delegates process ownership, wall/output limits, stream draining, and group termination to `@patchrace/core`. An `AdapterSink` must persist raw chunks before it accepts decoded records; `ArtifactAdapterSink` writes both into the immutable run tree.

Environment values inside `PreparedInvocation` are execution-only and must never be serialized as provenance. Results expose only sorted environment names. Raw records remain `local-sensitive`; normalized events do not fabricate unsupported file, token, cost, model, or timing data.

## Pi SDK

`createPiSdkRuntime(factory)` adapts an official Pi session factory with `subscribe`, `prompt`, optional protocol `abort`, and `dispose`. `PiSdkAdapter.prepare` refuses to run without an isolated resource root. If the installed Pi SDK is incompatible, use `PiCliAdapter`; the fallback is explicit and never changes a recorded variant silently.

## Standard trace export

`writeOtlpJsonTraceExport` produces a local OpenTelemetry OTLP/JSON
`resourceSpans` document. It requires `optIn: "confirmed"`, applies the shared
`Redactor` to the full export before writing, creates the destination with `wx`,
preserves missing timestamps as missing, and never uploads or publishes. Raw
vendor streams are excluded.

## Verification

```bash
pnpm vitest run packages/adapters/src/adapters.test.ts
```

The shared fixture exercises all three CLIs against one worktree protocol, plus malformed/oversized output, auth failure, missing/unsupported versions, timeout, repeated cancellation, SDK isolation, metrics, explicit unavailable capabilities, and redacted OTLP export.
