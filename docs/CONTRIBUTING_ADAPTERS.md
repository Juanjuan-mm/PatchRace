# Contributing an Agent Adapter

Last updated: 2026-07-23

An adapter translates one official, locally installed coding-Agent interface
into PatchRace lifecycle, raw evidence, normalized observable events, errors,
and metrics. It never grades a patch, infers hidden reasoning, installs or
authenticates a vendor tool, extracts credentials, or mutates global Agent
state.

PatchRace v0.1 has a closed built-in adapter set—Pi, Claude Code, and Codex—and
no runtime third-party adapter discovery. This guide is for a source
contribution to `@patchrace/adapters`. Adding a new adapter kind or a new
protocol that changes the public wire contract requires task-ledger review and
usually an ADR; do not imply that merely implementing an interface makes an
unreviewed plugin loadable.

Read the normative [Agent adapter contract](architecture/AGENT_ADAPTER.md),
[trace schema](architecture/TRACE_SCHEMA.md),
[system architecture](architecture/SYSTEM_ARCHITECTURE.md), and
[security guide](SECURITY_PRIVACY_AND_CLEANUP.md) first.

## Public contract

The public `@patchrace/adapters` entry exports `AgentAdapter`,
`ProbeInput`/`ProbeResult`, `PrepareInput`/`PreparedInvocation`,
`AdapterSink`, `RawRecord`, `AdapterResult`, cancellation types, and normalized
`TraceEventV1`. The lifecycle is:

```text
probe → prepare (no spawn) → run (raw-first) → normalize
                               ↘ cancel (idempotent)
```

The implementation must satisfy:

```ts
import type {
  AgentAdapter,
  AdapterResult,
  AdapterSink,
  CancelReason,
  CancelResult,
  NormalizeContext,
  PrepareInput,
  PreparedInvocation,
  ProbeInput,
  ProbeResult,
  RawRecord,
  RunningHandle,
  TraceEventV1,
} from "@patchrace/adapters";

export class ExampleAdapter implements AgentAdapter {
  readonly id = "example-cli";
  readonly kind = "example"; // requires an accepted AdapterKind contract change
  readonly contractVersion = "1.0.0" as const;
  readonly adapterVersion = "0.1.0";

  probe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult> {
    throw new Error("implement a bounded, non-mutating health probe");
  }

  prepare(
    input: PrepareInput,
    signal: AbortSignal,
  ): Promise<PreparedInvocation> {
    throw new Error("validate and return argv; do not spawn");
  }

  run(
    input: PreparedInvocation,
    sink: AdapterSink,
    signal: AbortSignal,
  ): Promise<AdapterResult> {
    throw new Error("use the shared process lifecycle and persist raw first");
  }

  cancel(
    handle: RunningHandle,
    reason: CancelReason,
  ): Promise<CancelResult> {
    throw new Error("signal only recorded ownership and remain idempotent");
  }

  async *normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1> {
    void context;
    for await (const record of raw) void record;
  }
}
```

The illustrative `kind` does not compile until the public `AdapterKind` union,
configuration schema, CLI selection, report provenance, and fixtures are
deliberately extended together. This is a useful guard against silently adding
an unsupported launch adapter.

## Implementation map

For a built-in CLI contribution:

1. Add the vendor-specific profile under `packages/adapters/src/`. Keep
   process ownership, output bounds, and cancellation in the shared core
   lifecycle; do not create a second subprocess runner.
2. Extend `AdapterKind` and `ADAPTER_COMPATIBILITY` with an explicit supported
   range, exact fixture versions, executable name, and known degradations.
3. Implement only documented official, non-interactive structured surfaces.
   Record the exact flags/mode as variant provenance.
4. Extend the CLI factory in
   `packages/cli/src/comparison-service.ts` and every exhaustive schema/config/
   report switch. Do not add vendor behavior to the CLI presentation layer.
5. Export only reviewed public surfaces from `packages/adapters/src/index.ts`.
6. Add/update package documentation and a Changeset for user-visible support.

`@patchrace/adapters` may depend only on public contracts and core lifecycle
primitives. It must not import task grading, diagnosis, optimizer, report, CLI,
or Pi-extension source. Imports must use package entry points, never
cross-package `src` paths.

## Probe and prepare rules

`probe` must resolve the selected executable, execute bounded official
version/help/status commands, normalize the supported range, report
capabilities and limitations, and provide an actionable remediation. PATH
presence alone is not readiness. Unknown or newer output fails closed or enters
an explicitly documented degraded mode.

Auth probing records readiness only. Never read token files, Keychain entries,
login cookies, environment values, or credentials from vendor configuration.
When the vendor has no safe reliable status command, return `unknown` and use a
minimal invocation preflight.

`prepare` validates canonical worktree/resource/session paths, capabilities,
model, sandbox/approval mode, environment **names**, and budgets. It builds an
argv array and must not spawn. Credential values are execution-only and must
never enter argv, logs, hashes, results, or provenance. Vendor sandbox flags are
capabilities, not proof of host containment.

## Raw-first execution and normalization

`run` uses the shared `@patchrace/core` process runner. The sink must durably
persist stdout/stderr bytes before decoded records are delivered. Apply maximum
total bytes, record bytes, record count, JSON depth, wall time, and termination
grace. Preserve malformed, unknown, fragmented, and oversized records with an
explicit parser error; never fabricate a clean terminal event.

Normalization maps only observable messages, tool calls, file operations,
commands/tests, errors, timing, usage, and results. An absent or unsupported
lane is `unavailable`, never zero or “did not happen.” Do not infer a file read
from text, map private reasoning, or unify incompatible vendor token
taxonomies without retaining their source meaning.

Usage and cost values require source record references. Subscription cost or a
missing value remains `null`. Missing values stay unavailable. Agent task failure is not an adapter failure.
Unknown errors retain raw evidence and are not silently retried.

Cancellation is idempotent, drains output during a bounded grace period, and
signals only the recorded process group/session. Never kill by executable name.
Ownership ambiguity retains evidence and produces manual recovery guidance.

## Fixture contract

Add fixture-backed tests beside the source as `*.test.ts`. Captured vendor
records must be synthetic or reviewed/redacted, contain no credentials, private
repository bytes, usernames, home paths, session secrets, or raw production
traces, and record the originating vendor/version/protocol separately.

The shared contract must cover:

1. missing executable and malformed version;
2. minimum/current supported versions plus older/newer refusal or degradation;
3. ready, missing, expired/unknown auth without secret disclosure;
4. exact cwd, instruction, model, resources, sandbox, approval, and environment
   name handling;
5. stdout/stderr separation, fragmented JSON, malformed/unknown/oversized
   records, backpressure, and output limits;
6. every supported observable event lane plus explicit unavailability;
7. successful completion and unavailable token/cost behavior;
8. Agent error, vendor/network error, timeout, and budget stop;
9. cancellation before spawn, during execution, repeated cancellation, a
   stubborn child, and preservation of an unrelated process;
10. session/raw/partial artifact retention and redacted local export.

Inject time, paths, IDs, executable output, and versions. Canonicalize only
nondeterministic fields; do not snapshot away meaningful ordering, offsets,
hashes, lifecycle transitions, or unavailable values. Default tests use a
local fixture executable and make no provider call.

Live compatibility is a separate, explicitly authorized gate. It may use only
version/help/status surfaces unless the user separately authorizes an exact
Agent task, model, endpoint, and budget.

## Verification and review

Run the narrow checks first:

```bash
pnpm exec vitest run packages/adapters/src/adapters.test.ts
pnpm qa:agents:fixtures
pnpm typecheck
```

Then run:

```bash
pnpm check
pnpm qa:agents
pnpm qa:security
pnpm qa:privacy
pnpm release:pack
pnpm supply-chain:licenses
```

`pnpm qa:agents` performs non-Agent version/help checks and can require selected
local executables or approved temporary packages. Do not run a credentialed or
paid live task merely because the fixture suite passes.

The pull request must include the protocol/version evidence, compatibility
range, fixture provenance/redaction statement, limitations, required docs,
Changeset, and exact command results. A new runtime dependency needs the
license, provenance, lifecycle, transitive-size, maintenance, ESM/Node, security,
and exit-plan review in
[STACK_AND_DEPENDENCIES.md](architecture/STACK_AND_DEPENDENCIES.md).
