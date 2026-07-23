# M4 Agent Adapter Layer Review

Status: passed 10/10 tasks on 2026-07-22

## Decision

`M4 — Agent adapter layer` passes. Pi CLI/SDK, Claude Code, and Codex now implement one versioned lifecycle with health/version/auth probes, pure invocation preparation, raw-first streaming, M3-owned process cancellation and budgets, normalized observable traces and metrics, explicit compatibility degradation, and confirmed local-only redacted standard export. `M5` may start with `EVAL-01`.

## Task evidence

| Tasks | Result | Evidence |
|---|---|---|
| `ADP-01` | PASS | `PiCliAdapter` builds `--mode json` argv without a shell, isolates `PI_CODING_AGENT_DIR`/session roots, disables telemetry, preserves raw stdout/stderr and decoded records through an `AdapterSink`, uses the M3 process group for timeout/cancel, and reports version/capability/auth-unknown provenance. |
| `ADP-02` | PASS | `PiSdkAdapter` refuses a missing isolated resource root, adapts an injected official session factory with subscribe/prompt/protocol-abort/dispose, persists SDK events in the same `RawRecord` shape, and documents `PiCliAdapter` as the explicit fallback. |
| `ADP-03` | PASS | Pi lifecycle, message, tool/file/search/command/edit, usage, error, cost-unavailable, and trace-summary records map deterministically to the public `TraceEventV1` contract with raw references. |
| `ADP-04..05` | PASS | Claude Code uses print `stream-json`, official auth status, no credential extraction, and noninteractive permission mode; Codex uses stable `exec --json`, explicit sandbox/approval/cwd, optional ephemeral sessions, and official login status. Both reuse the shared M3 runner. |
| `ADP-06` | PASS | Claude content blocks/results and Codex thread/turn/item/usage records map only observable fields. Missing cost, model, file-read, timestamp, or sandbox parity is explicit; no hidden reasoning or invented vendor evidence enters the trace. |
| `ADP-07` | PASS | Ten shared tests cover three-protocol invocation, raw-first backpressure, malformed/oversized JSONL, success, metrics, unavailable auth, missing/malformed/unsupported versions, timeout, cancellation before/during execution, repeated cancel, SDK isolation, and export. M3 process tests retain the stubborn-child/no-unrelated-process guarantee. |
| `ADP-08` | PASS | The exported compatibility matrix accepts only the fixture-tested minor ranges: Pi `>=0.81.0 <0.82.0`, Claude Code `>=2.1.0 <2.2.0`, and Codex `>=0.145.0 <0.146.0`. Newer/unknown versions fail explicitly; known degradations are code and documentation. |
| `ADP-09` | PASS | Normalized events export as OpenTelemetry OTLP/JSON `resourceSpans` only with `optIn: "confirmed"`; the complete object passes through the M3 redactor before an `wx` local write, missing time stays absent, and no publisher exists. `ADR-021` records the format decision. |
| `ADP-10` | PASS | All three CLI adapters complete the same deterministic repository fixture, retain comparable task/variant/adapter/raw provenance, emit a terminal normalized trace plus summary, and keep environment values out of probe/results. The public trace type and generated JSON Schema live in `@patchrace/contracts`. |

## Safety and privacy review

- The adapter layer does not spawn directly outside the M3 runner and never signals by executable name. Timeout and cancellation target only its recorded process group, keep draining streams, and retain partial raw evidence.
- PATH resolution is followed by an actual bounded version command. A broken executable is unavailable and never triggers an unrecorded fallback. Supported ranges are deliberately narrow until new fixtures prove compatibility.
- Auth probes use only `claude auth status` and `codex login status`; Pi remains `unknown` where no supported non-mutating status operation exists. No token/keychain/config content is enumerated or copied.
- Raw chunks persist before parser delivery. Oversized, over-depth, over-count, and malformed records remain referenced as local-sensitive evidence and yield stable parser errors.
- Pi and Claude do not claim vendor sandbox containment. Codex's exposed sandbox is recorded as a vendor capability; worktrees remain repository isolation only.
- Standard export is local, confirmed, redacted, create-new, and transport-free. Redaction retains its residual-risk limitation rather than declaring unknown secrets impossible.

## Verification

```text
pnpm check
pnpm m4:verify
pnpm release:pack
pnpm supply-chain:licenses
```

The quality gate passed 15 test files/42 tests, seven repository scenarios, four intentional quality failures, strict TypeScript/ESLint/Prettier, and generated both suite and trace JSON Schemas. The M4 verifier passed 10/10 tasks and checked all implementation/review/schema artifacts. Package dry runs and production license inventory are recorded in the final session entry.

No paid or credentialed model call was made: repository policy requires exact user authorization and budget for that action. The deterministic review exercises the official structured protocol shapes. Live non-secret probes on this machine remain explicit environment evidence: Pi is absent; Claude Code `2.1.104` is installed but logged out; the first PATH Codex wrapper is present but its platform binary is missing, matching `SPIKE-03`. These conditions do not weaken the fixture contract or get reported as live readiness.

Post-review note (2026-07-23): `QA-04` found that Claude Code `2.1.0` lacks
the required `auth status` surface and superseded the compatibility floor with
the verified `>=2.1.104 <2.2.0` range. The M4 row above remains the historical
range accepted at that review; current support is authoritative in
`packages/adapters/src/compatibility.ts` and `QA_AGENT_COMPATIBILITY.md`.

## M5 entrance decision

`EVAL-01` is dependency-ready. Task/grader work must consume immutable adapter evidence, preserve hidden-verifier isolation, and keep task outcome separate from adapter/process failure.
