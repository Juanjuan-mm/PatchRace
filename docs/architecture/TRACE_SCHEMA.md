# Normalized Observable Trace Contract

Status: current v0.1 contract
Last updated: 2026-07-22

## Boundary

The trace represents user-observable actions and results exposed by a CLI, SDK, filesystem diff, or PatchRace subprocess wrapper. It never requests, reconstructs, or labels hidden chain-of-thought. Vendor reasoning summaries, when explicitly emitted to the user, may be retained as opaque `message.observable` content but are not used as privileged ground truth.

## Envelope

Each line of `trace.jsonl` is one canonical JSON object:

```json
{
  "schemaVersion":"1.0.0",
  "eventId":"evt_01J...",
  "sequence":17,
  "trialId":"trial_01J...",
  "parentEventId":"evt_01J...",
  "type":"command.completed",
  "time":{"wall":"2026-07-22T12:00:01.250Z","monotonicMs":1250,"durationMs":84,"precision":"millisecond"},
  "actor":"agent",
  "source":{"adapter":"codex","adapterVersion":"1.0.0","vendorType":"item.completed","rawRef":{"path":"raw/vendor-events.jsonl","record":8}},
  "availability":"observed",
  "data":{},
  "sensitivity":["source-code","local-path"]
}
```

Required fields are version, ID, strictly increasing per-trial sequence, trial, type, actor, source, availability, and data. `parentEventId` groups start/update/completion events or ties errors to operations. Timestamps may be `null` when unavailable; order from the raw stream remains authoritative. Vendor IDs are data, never trusted as filesystem paths.

`availability` is one of `observed`, `derived`, `unavailable`, or `redacted`. Derived events name the deterministic rule and input event IDs. Unsupported vendor detail produces an explicit `capability.unavailable` event or unavailable field; it is never fabricated.

## Event taxonomy

### Lifecycle and messages

- `trial.started`, `trial.completed`, `trial.failed`, `trial.cancelled`, `trial.budget_exhausted`
- `turn.started`, `turn.completed`
- `message.observable` for user/assistant/final text that the CLI exposes
- `capability.reported`, `capability.unavailable`

### File observation

- `file.read.started|completed|failed`: repository-relative logical path, optional requested line/byte range, returned byte/line count, content hash when the complete returned content is available, truncation.
- `file.list.completed`: base path, pattern/options, returned logical paths/count, truncation.

No event claims a read solely because a filename appeared in text. A vendor tool event, captured command, or explicit SDK event is required.

### Search

- `search.started|completed|failed`: search kind (`text|path|symbol|web`), sanitized query or hash/redaction, scope, tool, result count, matched repository paths/line references where exposed, truncation.

Repeated searches retain separate events. Diagnosis may derive a loop feature but does not collapse raw events.

### Commands and tests

- `command.started|output|completed|failed`: argv when structurally exposed, otherwise shell text with `invocationKind:"shell"`; cwd, process provenance, stream/ref, exit code/signal, duration, truncation.
- `test.started|completed|failed`: a derived specialization only when the task config marks a command as test/build/lint/typecheck or structured vendor data identifies it. It cites the source command event and records suite/case counts only when observed.

Arguments and outputs may be redacted. Environment values are never normalized into the trace. `exitCode:null` means unavailable/interrupted, not success.

### Edits

- `edit.started|completed|failed`: operation (`create|modify|delete|rename|patch`), logical path/old path, before/after content hashes when available, byte/line deltas, diff reference, tool source.
- `repository.snapshot`: controller-derived Git status/diff summary at declared checkpoints.

Filesystem diff can prove that an edit occurred but not which agent tool caused it. Such records use `availability:"derived"`, actor `controller`, and no invented causal parent.

### Tools and errors

- `tool.started|progress|completed|failed`: vendor tool name, normalized class, invocation/result references, status.
- `error.observed`: category, stable normalized code, vendor code/message reference, retryability if reported, affected event.

Unknown tools retain `normalizedClass:"other"`; their exposed payload is stored by reference. Parser failure creates `error.observed` and leaves raw bytes intact.

### Timing, usage, and cost

- `usage.reported`: token dimensions as `{value, availability, source}` for input, cached input, output, reasoning output, cache write, and total. Missing dimensions are unavailable.
- `cost.reported`: amount, ISO currency, accounting basis (`vendor_reported|configured_rate|subscription_unknown`), covered token/event IDs, and availability.
- `budget.updated|exhausted`: budget kind, limit, consumed value, unit, enforcement source.

PatchRace may derive duration from monotonic controller timestamps and labels it derived. It does not calculate vendor cost unless a versioned configured rate table and exact token basis are present; subscription-bundled cost is `unavailable`, not `0`.

### Final result

`final.result` is emitted by the controller after grading, not copied from the agent's self-assessment:

```json
{
  "type":"final.result",
  "actor":"controller",
  "availability":"derived",
  "data":{
    "terminalState":"completed",
    "taskOutcome":"failed",
    "gradeRef":"grade.json",
    "gradeHash":"sha256:...",
    "patchRef":"patch.diff",
    "traceComplete":true,
    "limitations":["codex.file_reads_not_exposed"]
  }
}
```

Agent final text remains a separate `message.observable` event.

## Common data types

- `LogicalPath`: normalized repository/run-relative path; absolute path appears only in local raw evidence.
- `ContentRef`: `{path, hash, byteStart?, byteEnd?, record?}` into the artifact store.
- `AvailabilityValue<T>`: `{value:T|null, availability, source, reason?}`.
- `NormalizedError`: `{code, category, message, vendorCode?, retryable:"yes"|"no"|"unknown", remediation?}`.
- `Sensitivity`: any of `source-code`, `prompt`, `personal-data`, `credential-risk`, `local-path`, `hidden-verifier`, `public`.

Large content stays in referenced artifacts; trace records carry hashes, excerpts only within configured limits, and redaction state.

## Vendor mapping rules

| Normalized evidence | Pi | Claude Code | Codex |
|---|---|---|---|
| lifecycle | JSON/RPC/SDK `agent_*`, `turn_*` | stream-json system/assistant/result records | JSONL `thread.*`, `turn.*` |
| observable message | Pi message events | assistant/content blocks and result | `item.*` agent message |
| tool/action | tool execution events | content blocks/tool use/result when exposed | `item.*` command/file/MCP/web events |
| file/search/edit | tool name + structured arguments when exposed; final Git diff supplements edits | exposed tool records; final Git diff supplements edits | exposed item types; final Git diff supplements edits |
| command/test | bash/tool event plus PatchRace process wrapper | exposed Bash/tool event | command execution item |
| usage/cost | message usage fields when emitted | result usage/cost when emitted | `turn.completed.usage`; cost unavailable unless exposed/configured |
| final | agent end/message, then controller grade | result/final text, then controller grade | turn completion/final message, then controller grade |

Mappings are versioned fixtures per supported CLI range. A mapper consumes only documented/user-visible structured output. It records `source.vendorType` and raw record reference for every observed event.

## Ordering and correlation

Adapter read order assigns `sequence`. Vendor timestamps never reorder the stream. Start/update/end records share a correlation ID where exposed; otherwise the mapper uses an adapter-local stack only when nesting is unambiguous. Concurrent tools preserve vendor IDs and may overlap in time. Cross-agent alignment later uses event semantics and evidence, not equal sequence numbers.

## Completeness and quality

Each trial closes with a `trace.summary` containing raw record count, normalized count by type, malformed/skipped/redacted counts, mapper version, known unsupported capabilities, first/last monotonic times, and completeness (`complete|partial|unknown`). A valid trace can be partial; it cannot silently omit parser failures.

## Privacy and export

Raw traces are local-sensitive. Export redaction operates on typed fields and referenced content, emits redacted placeholder hashes rather than secret values, and preserves event order/type. Queries, prompts, outputs, code, paths, URLs, and error strings are all potentially sensitive. Redaction never upgrades `partial` to `complete` and always adds an export limitation record.

The optional v0.1 standard export is OpenTelemetry OTLP/JSON `resourceSpans`. One adapter trial becomes one span and normalized PatchRace events become ordered span events. Trace/span IDs are deterministic hashes of the trial identity; observed wall timestamps are converted to nanoseconds, while unavailable timestamps remain absent. PatchRace-specific data stays in `patchrace.*` attributes so no vendor field or causal relationship is invented. Typed event data is redacted before serialization so sensitive keys cannot be hidden inside a JSON string; the complete document then receives text redaction. Export requires explicit confirmation, includes the unknown-secret limitation, writes only a create-new local file, and includes no network publisher.

## Evolution

Major schema changes are incompatible. Minor versions add event types/optional fields. Consumers must ignore unknown event types for presentation but mark dependent analyses incomplete. Required semantic changes use a new type or major version; existing records are not rewritten.

## Acceptance mapping

The taxonomy and mapping rules explicitly cover file, search, command, edit, test, tool error, timing, token, cost, lifecycle, and final-result events, with provenance and unavailable-data semantics.
