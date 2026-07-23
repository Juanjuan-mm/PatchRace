# System Architecture RFC

Status: accepted for v0.1 by `ARC-01`  
Last updated: 2026-07-22

## Context and decision

PatchRace is a local-first controller that replays frozen software tasks, invokes user-installed coding-agent CLIs, grades resulting repositories, compares observable behavior, and stages reviewable Pi improvements. It is not a model host, hosted service, security sandbox, or autonomous configuration daemon.

The v0.1 deployment is one Node.js CLI process plus explicitly spawned local child processes. The CLI owns orchestration and durable state. Agent CLIs and repository commands remain separate processes with their own versioned adapters. All raw evidence stays on the user's machine unless an explicit export command creates a redacted copy.

## Architectural invariants

1. Deterministic graders and repository constraints precede any reflective or LLM judgment.
2. A run is durable and inspectable after interruption; completed records are append-only.
3. Every trial uses an exact Git commit plus a PatchRace-created worktree. A worktree is repository isolation, not host isolation.
4. The controller never reads or copies vendor tokens. It records only auth readiness and invokes official local auth paths.
5. Hidden verifier assets remain outside agent-visible worktrees until grading.
6. Model, harness, and Pi-resource changes are independent variant dimensions.
7. Candidate generation cannot read final holdout tasks or reference patches.
8. Cleanup acts only on canonical, recorded descendants of one run root and fails closed on ambiguity.
9. Global Pi state is read-only for inventory; candidates are staged project-locally and promotion is explicit.
10. Missing vendor events, tokens, or costs remain `unavailable`; they are never inferred as zero.

## Component model

```text
patchrace CLI
  ├─ config + schema service
  ├─ suite/task registry
  ├─ run planner + budget scheduler
  ├─ workspace manager ───── Git
  ├─ adapter host
  │    ├─ Pi adapter ─────── pi CLI / SDK
  │    ├─ Claude adapter ─── claude CLI
  │    └─ Codex adapter ──── codex CLI
  ├─ event normalizer ────── append-only trace
  ├─ grader host ─────────── setup/test/assertion child processes
  ├─ comparison + diagnosis engine
  ├─ candidate optimizer + promotion service
  ├─ artifact store
  └─ terminal / JSON / static HTML presenters
```

| Component | Owns | Must not own |
|---|---|---|
| CLI shell | argument parsing, human progress, exit code | business state or shell interpolation |
| Config service | versioned parsing, defaults, path-level errors, normalized config | executing repository commands |
| Suite registry | immutable task definitions, split hashes, provenance | run mutation |
| Planner/scheduler | trial DAG, concurrency, budgets, checkpoints | adapter-specific parsing |
| Workspace manager | exact worktree creation, provenance, retention, cleanup plan | host sandbox claims |
| Adapter host | capability discovery, invocation, signals, raw vendor output | grading or cross-vendor fabrication |
| Normalizer | raw-to-observable event mapping and provenance | hidden reasoning reconstruction |
| Grader host | isolated verifier injection and deterministic results | trusting agent-generated scores |
| Diagnosis engine | deterministic features, evidence-linked findings, optional reflection | overriding failed hard gates |
| Optimizer | bounded mutations, lineage, ablation, validation/holdout decisions | silent activation |
| Artifact store | atomic creation, hashes, append-only evidence, migrations | editing completed raw evidence |
| Presenters | render terminal/JSON/HTML from artifacts | becoming the source of truth |

## End-to-end data flow

```text
suite config + task + variant declarations
                 │ validate and normalize
                 ▼
             immutable run plan
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
 prepare worktree     reserve run artifact
       │                   │
       └──── spawn adapter ┘
                 │ raw stdout/stderr/session/vendor events
                 ▼
        raw log + normalized trace
                 │ stop/cancel/budget boundary
                 ▼
 inject hidden verifier outside agent control
                 │
                 ▼
 deterministic grader + repository assertions
                 │
                 ▼
 trial result ──> comparison ──> diagnosis
                                    │
                          train-visible evidence only
                                    ▼
                           staged Pi candidate
                                    │ ablation + validation
                                    ▼
                           one-time holdout gate
                                    │
                         promote / hold / reject
```

Inputs are copied or referenced by content hash in the run manifest before execution. Raw adapter streams are persisted before normalization. Grading consumes the final worktree plus verifier assets, never an agent-reported success statement. Presenters read durable artifacts, so a report can be regenerated without rerunning agents.

## Process and trust boundaries

The controller process contains config, scheduling, hashing, and state transitions. Four child-process classes are distinct:

- agent process: vendor CLI or Pi SDK worker; may read/edit only the declared worktree under the permissions actually enforced by that adapter;
- setup process: trusted-by-user repository preparation, executed before the agent without exposing grader secrets;
- verifier process: PatchRace-controlled commands after the agent exits, with hidden assets injected into a grader-only location;
- report helper: optional renderer with no network and no execution of artifact content.

Child processes receive a constructed environment allowlist plus explicit configured additions. Vendor auth remains available through the vendor's normal mechanism, but PatchRace does not enumerate auth stores or persist environment values. Process groups are recorded and only those groups may be signaled.

External model services and explicit report destinations are disclosure boundaries. Git worktrees do not constrain filesystem, process, credential, or network access outside the repository; onboarding and every unsafe repository-command flow must state that limitation.

## Local storage layout

Default project state is `.patchrace/`; a user may redirect it to another explicit path. The repository-facing config is reviewable, while volatile and sensitive artifacts are ignored by default.

```text
.patchrace/
  suite.yaml                    # user-reviewed suite declaration
  tasks/<task-id>/task.yaml     # versioned task contract
  baselines/<name>.json         # accepted comparison reference
  candidates/<candidate-id>/    # staged, reviewable Pi mutations
  runs/<run-id>/
    manifest.json               # immutable identity and provenance
    status.json                 # atomic mutable coordinator snapshot
    events.jsonl                # controller state transitions
    trials/<trial-id>/
      invocation.json
      raw/stdout.log
      raw/stderr.log
      raw/vendor-events.jsonl
      trace.jsonl
      patch.diff
      grade.json
      metrics.json
      result.json
    report/report.json
    report/index.html
  worktrees/<run-id>/<trial-id>/ # exact PatchRace-owned paths only
  cache/                         # content-addressed, safely disposable
```

`manifest.json`, task snapshots, raw streams, traces, patches, grades, and completed results are immutable once finalized. `status.json` is replaced atomically and is never the sole evidence. Run IDs and artifact rules are specified by `ARC-03`.

## State and failure handling

Run state is a monotonic state machine:

```text
planned → preparing → running → grading → completed
                    ↘ cancelling → cancelled
       any active state ↘ failed | interrupted | budget_exhausted
```

Each transition is appended to `events.jsonl` and then reflected atomically in `status.json`. On startup, PatchRace compares the snapshot to the event log, verifies hashes for finalized files, marks live-looking but ownerless trials `interrupted`, and offers only idempotent resume points.

Failure policy:

- config or preflight error: start no worktree or agent; return an actionable path-level error;
- worktree collision or ambiguous ownership: retain everything and refuse creation/cleanup;
- adapter unavailable/auth missing/unsupported: fail that trial before invocation with normalized error and recovery hint;
- malformed output: retain raw bytes, record parser failure, and never fabricate events;
- timeout/cancel: signal the recorded process group, wait a bounded grace period, escalate only within that group, finalize partial evidence;
- grader failure: distinguish task failure from grader infrastructure error; neither is converted into agent success;
- disk/write/hash failure: stop scheduling new work, retain exact paths, and report manual recovery;
- report failure: preserve the complete run; report regeneration is a pure retry.

Retries are explicit new attempts with lineage. PatchRace never silently retries paid agent work.

## Extension points

All extensions are data/contracts in v0.1, not arbitrary auto-loaded code:

- `AgentAdapter`: capability, invoke, stream, cancel, version/auth probes;
- `TraceMapper`: vendor event to normalized observable events;
- `TaskLoader`: versioned task/suite codecs;
- `Grader`: deterministic command or assertion result;
- `DiagnosisProvider`: deterministic facts first, optional redacted reflection second;
- `MutationProvider`: bounded declared candidate types;
- `Reporter`: reads stable report JSON and emits a local presentation;
- optional sandbox backend: future capability with an explicit security contract, never implied by worktrees.

Built-in plugins are registered in code and versioned with the CLI. Third-party executable extensions are deferred until signing/trust and containment policy exists. File-format extensions use schema discriminators and preserve unknown fields only where explicitly permitted.

## Concurrency and consistency

Planning is deterministic. Worktree setup and cleanup for one repository are serialized under a repository lock; ready trials may execute concurrently after unique paths exist. Artifact writes use create-new semantics or temp-file-plus-atomic-rename. Each completed file has a SHA-256 recorded in the manifest index. A per-run coordinator lease prevents two controllers from mutating the same run; stale leases require an inspected resume flow.

## Deployment model

v0.1 ships as an npm-distributed Node.js CLI for current macOS and Linux. It uses the user's Git and locally installed/authenticated Pi, Claude Code, and Codex. No daemon, database, account, container, inbound port, or hosted PatchRace service is required. Static reports have no remote scripts and open directly from disk. A future Pi package invokes the same core library; it does not duplicate execution state.

## Security and privacy consequences

- Local-first limits PatchRace-operated disclosure but agent vendors still receive data under their CLI/account settings.
- Raw local artifacts may contain secrets; redaction applies to a separate export copy and cannot guarantee removal of unknown secret formats.
- Repository commands are user-trusted executable input. PatchRace provides isolation and evidence, not containment.
- Hidden tests, candidate inputs, split hashes, and promotion records are separated so audit can detect leakage.
- Generated Markdown/settings are untrusted data until review; executable extension generation is outside v0.1.

## Rejected alternatives

- Hosted coordinator/database: violates v0.1 local-first and adds account/security scope.
- Treating each vendor session as the source of truth: cannot provide stable cross-agent grading or recovery.
- Docker-required execution: narrows activation and still needs a separate sandbox claim; optional backend remains possible.
- One opaque aggregate score: hides correctness failures and misleading vendor metric gaps.
- Direct global Pi mutation: conflicts with review, ablation, rollback, and safety invariants.

## Acceptance mapping

| `ARC-01` requirement | Section |
|---|---|
| Components | Component model |
| Data flow | End-to-end data flow |
| Process boundaries | Process and trust boundaries |
| Storage layout | Local storage layout |
| Extension points | Extension points |
| Failure handling | State and failure handling |
| Deployment model | Deployment model |

Dependent contracts may refine field names but must not weaken these invariants without a superseding ADR.
