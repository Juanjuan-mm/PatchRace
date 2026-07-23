# M1 Architecture and Technical Feasibility Review

Reviewed: 2026-07-22  
Milestone: `M1 — Architecture and technical feasibility`  
Review task: `ARC-09`  
Decision: **PASS**

## Executive verdict

M1 passes 15/15 tasks. PatchRace has a coherent local architecture, versioned CLI/config/artifact/trace/adapter/task/grader/optimizer contracts, an accepted implementation stack, and executable evidence for every critical feasibility path. No unresolved technical feasibility blocker prevents `M2` scaffolding.

The review does not claim implementation or production safety is complete. Adapter compatibility ranges, malicious-repository defenses, cross-platform process behavior, scale, redaction, and user activation remain owned by later tasks. Real Claude vendor execution could not run because this machine is not logged in; the official CLI's structured auth failure and a loopback protocol/cancellation run prove the adapter mechanism and required preflight behavior without bypassing auth.

## Task acceptance audit

| Task | Result | Evidence |
|---|---|---|
| `ARC-01` | PASS | [`architecture/SYSTEM_ARCHITECTURE.md`](architecture/SYSTEM_ARCHITECTURE.md): components, data/process/trust flow, storage, state/failures, extensions, deployment. |
| `ARC-02` | PASS | [`architecture/CLI_AND_CONFIG.md`](architecture/CLI_AND_CONFIG.md): all required commands, examples, confirmations, schema, normalized config, exit codes. |
| `ARC-03` | PASS | [`architecture/RUN_ARTIFACTS.md`](architecture/RUN_ARTIFACTS.md): IDs, manifests, raw logs, patches, grades, metrics, provenance, SHA-256, recovery, evolution. |
| `ARC-04` | PASS | [`architecture/TRACE_SCHEMA.md`](architecture/TRACE_SCHEMA.md): observable event taxonomy and Pi/Claude/Codex mappings, explicit unavailability/privacy. |
| `ARC-05` | PASS | [`architecture/AGENT_ADAPTER.md`](architecture/AGENT_ADAPTER.md): probes, invocation, streaming, cancellation, auth/version/metrics/errors, contract suite. |
| `ARC-06` | PASS | [`architecture/TASK_AND_GRADER.md`](architecture/TASK_AND_GRADER.md): baseline/setup/instruction/verifier/assertions/budgets/results and grader isolation. |
| `ARC-07` | PASS | [`architecture/PI_OPTIMIZER.md`](architecture/PI_OPTIMIZER.md): diagnoses/citations, mutation allowlist, ablation/objectives/lineage, holdout, decisions/rollback. |
| `SPIKE-01` | PASS | Pi `0.81.1` JSON CLI, persisted session, SDK events, isolated resources, loopback auth, process-group cancel; clean-room rerun passed. |
| `SPIKE-02` | PASS | Claude Code `2.1.104` stream-json/auth failure plus loopback task, usage/cost fields and cancel; clean-room rerun passed. |
| `SPIKE-03` | PASS | Healthy resolved Codex `0.145.0-alpha.18` completed live JSONL one-line fix/test, usage capture and interrupted read-only run; broken PATH install recorded. |
| `SPIKE-04` | PASS | Temporary worktree create/seed/run/interrupt/retain/remove preserved baseline and unrelated untracked file; rerun passed. |
| `SPIKE-05` | PASS | Three parent/commit reconstructions hid tests before simulated execution, injected afterward, and graded `0`; rerun passed. |
| `SPIKE-06` | PASS | Two traces yielded file/command/test-order differences and high-confidence diagnosis with exact event IDs/alternative; rerun passed. |
| `ARC-08` | PASS | [`architecture/STACK_AND_DEPENDENCIES.md`](architecture/STACK_AND_DEPENDENCIES.md): Node/TS/pnpm/Vitest/report/Python/agent/dependency/release policy; `ADR-009`, `ADR-017..020` accepted. |
| `ARC-09` | PASS | This review: dependency/status/link audit, clean-room reruns, risk review, contract/spike consistency, M2 entry decision. |

Complete spike commands/results and limitations are in [`spikes/M1_SPIKE_EVIDENCE.md`](spikes/M1_SPIKE_EVIDENCE.md).

## Contract and spike consistency

| Finding | Contract consequence | Consistency result |
|---|---|---|
| Pi exposes JSON CLI/session plus typed SDK events. | SDK primary, JSON CLI parity/fallback, RPC optional; isolate agent/session/resource roots. | MATCH |
| Pi official npm namespace migrated; old package deprecated. | Depend on `@earendil-works/pi-coding-agent`; package/version is provenance. | MATCH |
| Claude emits user-visible system/assistant/result stream and explicit auth error. | `stream-json` mapper; auth readiness may be missing/unknown; no token access or automated login. | MATCH |
| Codex JSONL exposes commands, file changes, messages, final usage. | Map only exposed items; keep missing file reads/search details unavailable; controller grade remains final. | MATCH |
| First Codex on PATH can exist but be nonfunctional. | Probe actual executable/version/auth and refuse silent identity switching. | MATCH (`ADR-020`) |
| Process-group termination closes stalled Pi/Claude and interrupted Codex runs without unrelated changes. | Owned group, protocol interrupt where available, drain/grace/finalize, fail safe on ownership ambiguity. | MATCH |
| Exact Git worktree removal preserved unrelated primary state. | Serialize per-repo lifecycle, record porcelain ownership, exact cleanup/dry run, retain on ambiguity. | MATCH |
| Three historical commits support parent reset and held-test injection. | Reference patch/verifier outside agent view; grader-only injection after agent exit; merge/drift filtering. | MATCH |
| Observable event order supports evidence-linked diagnosis. | No hidden reasoning; deterministic facts/citations and alternatives before reflection. | MATCH |

No contract promises a field or containment guarantee contradicted by spike evidence. Vendor metric/event gaps are modeled as unavailable rather than fabricated.

## Architecture consistency audit

- Product boundary: Pi-native/cross-agent, deterministic correctness first, local-first/no telemetry, project-local candidates, holdout isolation, and no executable extension generation all remain unchanged from M0.
- Safety boundary: worktrees are never called a sandbox; repository setup/tests remain trusted host-executed code; exact cleanup/cancellation ownership is architectural, not deferred UX.
- Evidence flow: raw adapter streams precede normalization; normalized traces precede diagnosis; grader-controlled results precede comparison/promotion; reports are derived.
- Identity/evolution: config/task/variant/run/trial/artifact hashes and schema major/minor rules agree across contracts.
- Side effects: init/report/doctor behavior, run execution, grader injection, promotion, rollback, and cleanup confirmations have distinct boundaries.
- Optimization: evidence tiers, one-variable ablation, correctness-first vector, validation selection, final holdout, explicit promotion/rollback are consistent with success criteria.
- Deployment: one npm Node runtime, user-managed agent CLIs, no daemon/database/account, optional Python bridge only.

## Risk review

All 16 active risks were reviewed in [`RISKS.md`](RISKS.md). M1 provides concrete mitigation evidence for adapter drift, worktree lifecycle, history reconstruction/leakage separation, auth boundaries, runtime weight, and evidence-linked diagnosis. `R-016` was added after finding a broken Codex PATH installation beside a healthy official bundled binary.

No risk is closed prematurely. The highest-impact residual work is:

- implement exact-path/symlink/lock/process chaos tests before claiming cleanup safety;
- create adapter version fixtures/matrix and fail/degrade explicitly on drift;
- implement raw-artifact sensitivity/redacted export and malicious HTML/path/command fixtures;
- validate real historical repositories for flake, merge/dependency/LFS/submodule cases;
- measure diagnosis precision and teaching generalization on labeled/held-out tasks.

These are implementation and validation tasks with accepted mechanisms, not unresolved architecture choices.

## Review verification

Commands run:

```bash
for f in spikes/*.mjs; do node --check "$f"; done
node spikes/verify-m1.mjs
node spikes/local-feasibility.mjs
node spikes/pi-spike.mjs
node spikes/claude-spike.mjs
```

Results:

- all spike scripts passed Node syntax checks;
- control audit: 143 unique canonical task IDs, 15 M1 rows, 9 required M1 deliverables, zero broken local Markdown links;
- local feasibility clean-room rerun: worktree, 3 historical reconstructions, and differential diagnosis all PASS;
- Pi clean-room rerun: CLI 13 events, one session, SDK 12 events, process-group exit 143, PASS;
- Claude clean-room rerun: 3 structured records with usage/cost/session plus process-group exit 143, PASS;
- live Codex fixture was not repeated during final audit to avoid unnecessary paid external work; the earlier run independently passed `npm test`, `git diff --check`, test immutability, structured usage, and cancellation inspection.

## Residual limitations and explicit non-blockers

- Claude is installed but not logged in on this machine. `doctor` must report this and tell the user to use the official login; PatchRace never works around it.
- Pi loopback evidence used a deterministic custom model rather than a paid provider; it proves CLI/SDK/session/cancel surfaces, not vendor model quality.
- The healthy Codex evidence binary is an extension-bundled alpha while the global stable npm wrapper is broken. M2 must implement executable selection as configuration plus probe evidence, never an invisible fallback.
- M1 cancellation is macOS evidence. Linux and supported version matrices remain `QA-02/03/04` work.
- Historical reconstruction covers simple linear JavaScript commits. Real mining eligibility filters remain necessary.
- Trace diagnosis proves mechanism, not the frozen 80% precision release gate.

None changes the v0.1 promise or requires a new architectural decision before scaffolding.

## M2 entrance decision

`M2 — Development foundation` is approved to start with `DEV-01`.

The scaffold must preserve these first-order constraints:

1. Node 22/24 LTS strict ESM TypeScript monorepo and pinned pnpm/lockfile.
2. Stable schemas/contracts are package boundaries; raw evidence and deterministic grades are primary.
3. Agent CLI dependencies remain optional user-managed capabilities with health/version/auth probes.
4. Process/worktree/destructive APIs start with exact ownership and fixture coverage, not convenience wrappers.
5. No Python, UI framework, daemon, hosted service, telemetry, or executable candidate generation enters the scaffold without a replacing ADR/task.

Next dependency-ready task: `DEV-01 — Scaffold TypeScript monorepo`.
