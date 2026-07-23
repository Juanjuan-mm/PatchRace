# Session Log

This is an append-only summary of project work. Detailed history remains in Git once commits begin.

## 2026-07-22 — OPS-001 Establish project-control records

- Status: DONE
- Goal: turn the approved product direction into an executable, maintainable plan from zero to public GitHub release.
- Changes: created the product brief, milestone execution plan, canonical task ledger, progress dashboard, decision log, risk register, maintenance protocol, session log, and repository landing page.
- Verification: confirmed the repository began empty with no commits; verified 143 canonical task rows have unique IDs, milestone counts match the ledger, and all control documents are present.
- Decisions/risks: captured current decisions as proposed rather than pretending they are formally frozen; recorded initial technical, product, security, privacy, and scope risks.
- Remaining work: freeze the product brief and current proposed decisions through `F0-01`.
- Next recommended task: `F0-01`.

## 2026-07-22 — F0-01 Freeze the MVP product brief

- Status: DONE
- Goal: convert the researched direction into an accepted v0.1 product contract.
- Changes: froze the Pi-native/cross-agent promise, primary persona, required/deferred scope, boundaries, product language, canonical vocabulary, and supporting policy links in `PROJECT_BRIEF.md`.
- Verification: every acceptance field in the `F0-01` ledger row is explicitly present and audited in `M0_REVIEW.md`.
- Next recommended task at completion time: `F0-02`.

## 2026-07-22 — F0-02 Verify naming

- Status: DONE
- Goal: perform a point-in-time collision check and select development/fallback names.
- Changes: created `NAMING.md`; selected PatchRace/`patchrace`/`pi-patchrace`; recorded name semantics, fallbacks, and launch recheck.
- Verification: npm returned E404 for both packages; GitHub API returned zero matching repository names; `.com` WHOIS and `.dev` RDAP reported not found; indexed exact trademark searches found no obvious software mark.
- Risks: names are not reserved and the search is not legal clearance; `LCH-01` remains mandatory.
- Next recommended task at completion time: `F0-03`.

## 2026-07-22 — F0-03 Select license and governance

- Status: DONE
- Goal: establish contribution and decision authority before public implementation.
- Changes: selected Apache-2.0, PatchRace contributors copyright notice, DCO 1.1, Contributor Covenant 2.1, lead-maintainer governance, sensitive-change review, and governance triggers in `GOVERNANCE.md`.
- Verification: all fields required by `F0-03` are explicit; `ADR-011` and `ADR-013` are accepted.
- Remaining work: add exact canonical files and a real private contact in later scaffold/launch tasks.

## 2026-07-22 — F0-04 Define positioning

- Status: DONE
- Goal: state a defensible market boundary without false novelty claims.
- Changes: created `POSITIONING.md` comparing EvoSkill, GEPA, Stet, Qwen Arena, generic harnesses, Pi, Claude Code, and Codex; added differentiation pillars and allowed/prohibited claims.
- Verification: each named competitor has a public source and the positioning explicitly disclaims universal-best, sandbox, and first-in-category claims.

## 2026-07-22 — F0-05 Freeze success and stop criteria

- Status: DONE
- Goal: make launch and product continuation evidence-driven.
- Changes: created `SUCCESS_CRITERIA.md` with evidence tiers, activation, reliability, dogfood, beta, diagnosis, teaching, performance, cost, security, documentation, launch, and pivot gates.
- Verification: all required metric categories are quantified; onboarding, teaching, cost, adapter, and safety stop conditions are explicit; `ADR-015` is accepted.

## 2026-07-22 — F0-06 Establish threat and privacy boundaries

- Status: DONE
- Goal: constrain architecture before it can create destructive or privacy-sensitive behavior.
- Changes: created `THREAT_MODEL.md` covering assets, actors, trust boundaries, data inventory, no-telemetry default, destructive rules, generated candidates, 15 principal threats, retention, and residual risks.
- Verification: the document explicitly states that PatchRace/worktrees are not a sandbox and that local-first is not offline; associated decisions are accepted.

## 2026-07-22 — F0-07 Define personas and workflows

- Status: DONE
- Goal: identify launch users and rank complete jobs rather than isolated features.
- Changes: created `PERSONAS_AND_WORKFLOWS.md` with three personas, non-primary users, and five ranked workflows from comparison through regression protection.
- Verification: every workflow includes entry conditions, flow, desired outcome, and failure modes.

## 2026-07-22 — F0-08 M0 milestone review

- Status: DONE
- Goal: prove all M0 acceptance requirements and internal consistency before M1.
- Changes: created `M0_REVIEW.md`; audited every task, product/scope/evidence/security/governance consistency, research evidence, explicit deferrals, risks, and M1 entrance readiness.
- Verification: 8/8 M0 tasks pass; no unresolved M0 blocker; all deferrals have owners; progress and task ledger now point to `ARC-01`.
- Next recommended task: `ARC-01`.

## 2026-07-22 — ARC-01 System architecture RFC

- Status: DONE
- Changes: created `architecture/SYSTEM_ARCHITECTURE.md` covering components, data/process/trust flow, storage, lifecycle/recovery, extension points, concurrency, deployment, and rejected alternatives.
- Verification: required acceptance headings and M0 safety/product invariants were cross-checked.
- Next recommended task at completion time: `ARC-02`.

## 2026-07-22 — ARC-02 CLI and configuration

- Status: DONE
- Changes: specified every required v0.1 command, examples, confirmations/side effects, stable exit categories, YAML/JSON schema, normalization, and compatibility behavior.
- Verification: all required command names, exit semantics, and configuration sections passed structural checks.
- Next recommended task at completion time: `ARC-03`.

## 2026-07-22 — ARC-03 Immutable run artifacts

- Status: DONE
- Changes: defined run/trial/content identity, append/finalize rules, manifest/invocation/provenance, raw logs, patch, grade/metrics/result, hashes/index, recovery, export, and schema evolution.
- Verification: every ledger acceptance artifact class and immutability rule is explicit.
- Next recommended task at completion time: `ARC-04`.

## 2026-07-22 — ARC-04 Normalized trace schema

- Status: DONE
- Changes: defined observable event envelope/taxonomy for lifecycle, file, search, command/test, edit, tool/error, timing, usage, cost, and controller final result, plus Pi/Claude/Codex mappings.
- Verification: missing vendor data is explicitly unavailable and hidden reasoning is outside the contract.
- Next recommended task at completion time: `ARC-06`.

## 2026-07-22 — ARC-06 Task and grader contracts

- Status: DONE
- Changes: specified immutable baseline/setup/instruction/verifier/assertion/budget/provenance contracts, grader API, hidden injection, integrity states, result schema, and split controls.
- Verification: grader isolation and infrastructure-error versus task-failure semantics were audited against the threat model.
- Next recommended task at completion time: `ARC-07`.

## 2026-07-22 — ARC-07 Pi optimizer contract

- Status: DONE
- Changes: specified evidence citations, diagnosis input, safe mutation allowlist, candidate artifact/lineage, one-variable ablation, objective vector, search budgets, holdout rules, promotion/hold/reject/no-candidate, and rollback.
- Verification: evidence tiers and correctness/safety precedence match the frozen success criteria.
- Next recommended task at completion time: `ARC-05`.

## 2026-07-22 — ARC-05 Agent adapter contract

- Status: DONE
- Changes: defined capability/version/auth probes, pure preparation, structured streaming, process-group cancellation, metrics, normalized errors, Pi/Claude/Codex profiles, and shared contract-suite cases.
- Verification: all required acceptance surfaces have typed/testable interfaces and no credential extraction.
- Next recommended task at completion time: `SPIKE-01`.

## 2026-07-22 — SPIKE-01 Pi headless and SDK

- Status: DONE
- Changes: installed current Pi `0.81.1` temporarily, added a deterministic loopback spike, isolated resources/session, exercised JSON CLI and SDK, and recorded missing-real-auth behavior.
- Verification: clean-room rerun produced 13 CLI events, one session file, 12 SDK events, and process-group cancellation exit `143`.
- Decisions/risks: selected current `@earendil-works/pi-coding-agent`; deprecated namespace is not used.

## 2026-07-22 — SPIKE-02 Claude Code headless

- Status: DONE
- Changes: probed Claude Code `2.1.104`, captured explicit real `authentication_failed`, and added a deterministic Anthropic-compatible loopback task/cancel spike.
- Verification: clean-room rerun produced system/assistant/result records, session/usage/cost fields, `FIXTURE_OK`, and cancellation exit `143`.
- Remaining limitation: this machine needs the official Claude login for a real vendor-backed task.

## 2026-07-22 — SPIKE-03 Codex headless

- Status: DONE
- Changes: discovered broken global Codex `0.120.0`, resolved a healthy official bundled `0.145.0-alpha.18`, ran a live authenticated JSONL fixture fix, and interrupted a second read-only run.
- Verification: Codex changed only `src/add.js`, `npm test` passed 1/1, `git diff --check` passed, tests stayed unchanged, structured commands/file change/usage were captured, and cancellation left no process/session change.
- Decisions/risks: added executable-health/provenance policy (`ADR-020`, `R-016`).

## 2026-07-22 — SPIKE-04 Safe worktree lifecycle

- Status: DONE
- Changes: added a temporary Git lifecycle fixture covering create, seed, worker run, group interrupt, evidence retain/inspect, and exact Git cleanup.
- Verification: reruns preserved baseline HEAD and a pre-existing unrelated untracked file while removing only the recorded worktree.

## 2026-07-22 — SPIKE-05 Historical reconstruction

- Status: DONE
- Changes: added three linear PR-shaped fixture commits and reconstructed each parent with implementation-only patch plus post-run held-back test injection.
- Verification: all three tests were absent before execution, injected only for grading, and exited `0`; exact worktrees were cleaned.

## 2026-07-22 — SPIKE-06 Trace differential and diagnosis

- Status: DONE
- Changes: added contrasting file/search/command/test traces and deterministic difference/diagnosis output.
- Verification: file/command/test order differed as intended; diagnosis cited exact `a1..a3`/`b1..b6` events and preserved an alternative explanation.

## 2026-07-22 — ARC-08 Stack and dependency policy

- Status: DONE
- Changes: accepted Node 22/24 LTS, TypeScript 6, pnpm 10, Vitest 4, strict ESM, vanilla static report, optional subprocess Python, current Pi package/surfaces, and dependency/supply-chain rules in `architecture/STACK_AND_DEPENDENCIES.md` and `ADR-009`, `ADR-017..020`.
- Verification: every required stack/policy field is explicit and tied to M1 evidence/current primary documentation.
- Next recommended task at completion time: `ARC-09`.

## 2026-07-22 — ARC-09 M1 milestone review

- Status: DONE
- Goal: verify all M1 contracts and spikes, risk mitigations, residual limitations, and M2 readiness.
- Changes: created `M1_REVIEW.md` and `spikes/verify-m1.mjs`; updated risks, task/progress/README records, and M2 entrance constraints.
- Verification: 15/15 M1 tasks pass; 143 unique task IDs, 9 required M1 deliverables, zero broken local links; syntax/local/Pi/Claude clean-room checks passed; live Codex evidence independently passed.
- Decisions/risks: no feasibility blocker; all production/compatibility/security residual work retains a downstream owner.
- Next recommended task: `DEV-01`.

## 2026-07-22 — Local DeepSeek E2E credential registration

- Status: DONE
- Goal: make the user-provided DeepSeek credential safely discoverable across future sessions without committing plaintext.
- Changes: stored the secret as a generic password in the macOS login Keychain under service `patchrace-deepseek-api-key`, account `deepseek`; recorded only retrieval metadata and handling rules in `MAINTENANCE.md` and readiness in `PROGRESS.md`.
- Verification: `security find-generic-password` returned the expected service/account metadata without requesting or printing the password value.
- Safety: future E2E commands must inject it only through `DEEPSEEK_API_KEY`, never print it, and keep it unavailable to repository setup, graders, traces, reports, and exports.

## 2026-07-22 — DEV-01..DEV-10 M2 development foundation

- Status: DONE
- Goal: execute every M2 task and pass the development-foundation exit gate.
- Changes: scaffolded nine strict-ESM TypeScript workspaces with pnpm/project references; added one-command quality gates and intentional failure fixtures; added pinned macOS/Linux Node 22/24 CI; created seven deterministic TypeScript/Python/Git/process fixtures; implemented all v0.1 CLI routes, stable errors, structured redacted logging, and diagnostic bundles; added contributor/DCO workflow; configured Changesets and nine-package audited dry-run packing; added lockfile, dependency review, audit, license inventory, lifecycle-script controls, and Dependabot; created `M2_REVIEW.md` and `scripts/verify-m2.mjs`.
- Verification: `pnpm check` passed (3 test files/6 tests, 7 repository scenarios, 4 intentional quality failures); CLI help/JSON routing passed; `pnpm supply-chain:audit` reported no known vulnerabilities; production license inventory passed for one external runtime package; nine tarballs passed content audit; a fresh temporary tree containing 121 source files passed frozen install, full check, packaging, and license inventory.
- Decisions/risks: no architecture change and no new high-impact risk. Hosted CI cannot run before the repository has a commit/remote; its exact local command path passed, the full-SHA-pinned workflow covers the accepted matrix, and hosted/cross-platform evidence remains observable on first push and at `QA-02`.
- Remaining work: M2 has no implementation remainder. Later milestones replace side-effect-free command placeholders with real services.
- Next recommended task: `CORE-01`.

## 2026-07-22 — CORE-01..CORE-12 M3 reproducible execution core

- Status: DONE
- Goal: execute every M3 task and pass the reproducibility, destructive-action, recovery, and artifact exit gates.
- Changes: implemented strict YAML/JSON suite loading and normalized identities; durable immutable/append-only run storage; exact detached Git worktrees; argv-only process groups with streamed output and intentional environments; dependency/lock-aware concurrent scheduling; wall/run/token/cost/disk budgets; cancellation checkpoints, lease-safe recovery, and idempotent pending-work resume; token/value/path/field redaction and separate exports; Node/Git/capacity/config/CLI/auth doctor checks; exact dry-run/confirmed cleanup for worktrees, artifacts, and cache; generated the published suite JSON Schema; added the M3 end-to-end fixture, verifier, and review.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 14 test files/32 tests, seven M2 repository scenarios, four intentional quality failures, and build/schema generation. The end-to-end test prepared two real Git worktrees, executed a process, interrupted and recovered the run, resumed only the pending trial, rejected duplicate finalization, verified/redacted artifacts, and cleaned exactly the owned targets. `pnpm m3:verify` passed 12/12 tasks; nine package dry runs passed; seven external production packages passed license inventory; the final moderate-threshold npm audit reported no known vulnerabilities.
- Decisions/risks: added only the architecture-approved `ajv` and `yaml` runtime dependencies. Audit findings discovered during the exit gate were remediated by upgrading to `ajv 8.18.0` and `yaml 2.8.3`, with a deeply nested YAML regression test. Recovery deliberately refuses ambiguous live leases, raw local evidence remains sensitive, redaction retains a residual-risk warning, and worktrees remain repository isolation rather than a host sandbox.
- Remaining work: agent-specific invocation, capability/version compatibility, and trace normalization begin in M4; no M3 implementation remainder remains.
- Next recommended task: `ADP-01`.

## 2026-07-22 — ADP-01..ADP-10 M4 agent adapter layer

- Status: DONE
- Goal: execute every M4 task and pass the shared three-agent contract, compatibility, provenance, auth/privacy, and standard-export exit gates.
- Changes: implemented the `1.0.0` adapter interface and raw record/lifecycle/error/metric types; added shell-free health/version/auth probing and pure invocation preparation; reused the M3 process runner for streamed raw-first bytes, JSONL bounds, backpressure, output/time budgets, process-group timeout, and idempotent cancellation; implemented Pi CLI plus isolated SDK session-factory execution, Claude Code print stream JSON, and Codex exec JSONL; mapped all three observable protocols to deterministic normalized traces with explicit unavailable capabilities; added narrow machine-tested compatibility ranges; promoted the public trace envelope and generated JSON Schema into `@patchrace/contracts`; selected confirmed, redacted, local-only OpenTelemetry OTLP/JSON export in `ADR-021`; documented profiles, fallbacks, safety limitations, and the M4 review; added a Changeset.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 15 test files/42 tests, seven repository scenarios, four intentional quality failures, and build/schema generation. Ten adapter tests passed the same three-protocol fixture plus raw-before-parse ordering, malformed/oversized records, success/metrics, missing/malformed/unsupported versions, missing auth, vendor auth failure, timeout, cancellation before/during execution, repeated cancel, Pi SDK isolation, trace summaries, and redacted OTLP export. `pnpm m4:verify` passed 10/10 tasks and 11 required modules; all nine package dry runs passed and the production license inventory passed for seven external packages.
- Decisions/risks: accepted `ADR-021`. Compatibility ranges intentionally cover only Pi `0.81.x`, Claude Code `2.1.x`, and Codex `0.145.x`; `R-001` remains open for future CLI drift and `QA-04` cross-platform expansion. PATH health checks now mitigate `R-016` but do not silently search for a replacement identity. Pi/Claude do not claim host sandbox parity, worktrees remain non-sandbox isolation, raw traces remain local-sensitive, and redaction retains residual risk.
- Live environment: no paid or credentialed model invocation was authorized or performed. Non-secret probes found Pi absent, Claude Code `2.1.104` installed but logged out, and the first PATH Codex wrapper broken because its platform binary is missing; all remain explicit readiness results rather than false passes.
- Remaining work: M4 has no implementation remainder. Real authenticated compatibility evidence expands under the exact authorization/budget and cross-platform gates in later milestones.
- Next recommended task: `EVAL-01`.

## 2026-07-22 — OPS-002 Reconcile the repository agent contract

- Status: DONE
- Goal: fully read the previously missed repository-root `AGENTS.md`, compare every new repository-wide constraint with the current project, and close any resulting implementation or verification gap.
- Changes: made fixed-path `AGENTS.md` review the first task-start step in `MAINTENANCE.md`; verified the accepted package graph, strict ESM TypeScript 6 / Node 22-and-24 / pinned pnpm stack, official structured Pi/Claude/Codex surfaces, raw-evidence/privacy boundaries, exact cleanup rules, task discipline, generated-file policy, local E2E credential rules, and release-package exclusions. Moved the public normalized suite types and source JSON Schema from `@patchrace/core` to their required owner `@patchrace/contracts`, retained core compatibility re-exports, changed schema generation and package exports accordingly, and added the missing M2 and M3 Changesets. Removed the unchecked structured-log field assertion, strengthened all M2 process fixtures plus Git/process/cancellation/artifact/cleanup tests to prove unrelated state is preserved, and retained causal error information in recovery/finalization/probing paths. The M2 clean-room verifier now creates a temporary Git baseline and validates the Changesets release plan.
- Verification: the final clean-room `pnpm check` passes Prettier, ESLint, strict TypeScript, 15 test files/45 tests, deterministic fixture gates, and build/schema generation; the temporary Git checkout produces the expected nine-package minor plan, nine audited tarballs, and a passing seven-package production license inventory. `pnpm m3:verify` enforces contracts ownership and absence of the stale core schema; `pnpm m4:verify` preserves the completed adapter gate. Package inspection confirms only contracts publishes the suite and trace schemas. No paid/credentialed model call or Keychain retrieval occurred.
- Decisions/risks: no new product decision or ADR was required; the schema relocation enforces the already accepted package boundary rather than changing it. `ADR-009`, `ADR-016`, `ADR-017`, the development guide, stack policy, threat model, and maintenance credential registry implement the remaining contract. The root file is untracked but not ignored, so future task startup reads it directly rather than assuming an enumeration result is complete.
- Remaining work: hosted Node 22/24 and macOS/Linux evidence still begins after repository activation as already recorded; real agent E2E remains gated by exact user authorization and budget.
- Next recommended task: `EVAL-01`.

## 2026-07-22 — EVAL-01 Versioned task format

- Status: DONE
- Goal: implement an immutable, versioned task wire format that serializes and validates every execution and grading input.
- Changes: added the public `TaskV1` types and JSON Schema in `@patchrace/contracts`; implemented strict JSON/YAML loading, path-level schema errors, semantic command/assertion checks, descendant and regular-file enforcement, content-hash validation for instructions/setup/verifier assets, canonical serialization, and deterministic `taskHash` identity in `@patchrace/tasks`; added package documentation and a Changeset.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 16 test files/50 tests, seven repository fixtures, four intentional quality failures, and schema generation; `pnpm release:pack` produced nine audited package tarballs including `task-v1.json`. Tests cover deterministic identity, JSON/YAML parity, unknown keys, missing references, content tampering, and symlink escape. No agent, credential, or paid call was used.
- Decisions/risks: no ADR or new runtime library was required; tasks reuse the already admitted exact Ajv/YAML dependency versions. Executable task commands remain explicitly trusted host code, and hidden assets remain outside agent-visible paths for `EVAL-05`.
- Remaining work: graders and suite initialization consume this contract in subsequent M5 tasks.
- Next recommended task: `EVAL-02`.

## 2026-07-22 — EVAL-02 Manual suite initialization

- Status: DONE
- Goal: make `patchrace init` create and verify an editable working suite without invoking an agent.
- Changes: implemented recoverable manual initialization in `@patchrace/tasks`; generated a review-required suite, `TaskV1`, and instruction from the exact current Git commit; integrated the task service into the CLI; added safe descendant checks, pre-write baseline validation, conflict refusal, timestamped `--force` backups, post-write suite/task verification, stable hash results, documentation, and release metadata.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 17 test files/54 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed for all nine packages. Tests prove exact HEAD identity, no agent invocation, JSON stdout isolation, user-file preservation, no-commit preflight failure, conflict refusal, and recoverable forced replacement.
- Decisions/risks: no architecture or dependency change. Generated repository commands remain disabled for trust until user review; the scaffold labels itself unreviewed and includes no hidden verifier.
- Remaining work: history-backed initialization begins with `EVAL-06`; deterministic grading begins in `EVAL-03`.
- Next recommended task: `EVAL-03`.

## 2026-07-22 — EVAL-03 Deterministic command/test grader

- Status: DONE
- Goal: execute setup/build/test/lint/typecheck verification outside Agent control and retain structured evidence.
- Changes: added public command-evidence result types and a deterministic phase runner using the M3 process lifecycle; enforced explicit argv or trusted shell execution, constructed environment names/values, canonical cwd and evidence containment, time/cancellation/output limits, expected exit codes, create-only stdout/stderr/result files, content hashes, and phase summaries; documented the host-code trust boundary.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 18 test files/57 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed for all nine packages. Tests cover build/test/lint/typecheck evidence, nonzero expected success, timeout, pre-start cancellation, cwd traversal, evidence symlink escape, duplicate evidence refusal, and unrelated-file preservation.
- Decisions/risks: no new dependency or ADR. Task commands remain explicitly trusted user code running on the host; the grader receives no adapter or vendor authentication surface and evidence must resolve outside its worktree.
- Remaining work: deterministic file/diff assertions compose with these command gates in `EVAL-04`.
- Next recommended task: `EVAL-04`.

## 2026-07-22 — EVAL-04 File, diff, and repository assertions

- Status: DONE
- Goal: enforce deterministic file, diff, dependency, cleanliness, and patch-size gates against the immutable baseline.
- Changes: added public assertion result/summary contracts and a Git-backed assertion evaluator; implemented deterministic no-rename changed-file/line/binary counts, dependency and lockfile classification, required/forbidden/protected glob matching, exact/regex/hash content rules, untracked allowlists, merge-conflict detection, command-evidence assertions, optional skips, baseline identity checks, relative-path-only evidence, and symlink containment.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 19 test files/60 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed for all nine packages. Real Git fixtures verify exact counts, protected untracked paths, dependency/lock violations, clean bounded patches, baseline mismatch, merge conflicts, outside symlinks, and preservation of unrelated content.
- Decisions/risks: no dependency or ADR change. Git inspection failure and unsafe resolution remain grader errors, distinct from an assertion failure; repository commands remain trusted host code.
- Remaining work: hidden verifier assets and grader-only worktree injection begin in `EVAL-05`.
- Next recommended task: `EVAL-05`.

## 2026-07-22 — EVAL-05 Hidden verifier injection

- Status: DONE
- Goal: keep held-back verifier assets unavailable during Agent execution and inject them only into a separate grader-owned worktree.
- Changes: changed hidden task loading to require a separate explicit verifier vault; added exact stopped-Agent worktree ownership/head checks, tracked binary patch plus regular-untracked snapshot hashing, detached grader worktree reproduction, external-source and post-load hash validation, create-new mount injection with canonical parent checks, verifier execution, exact successful cleanup, and fail-safe retention on integrity errors; documented the isolation boundary and added public result types.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 20 test files/64 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Real Git fixtures prove hidden-test absence in the Agent worktree, tracked/untracked snapshot fidelity, hidden verifier success, grader-only cleanup, running-Agent refusal, forged mount collision, vault tamper detection, retained failure evidence, and unrelated-state preservation.
- Decisions/risks: resolved a contract conflict by making hidden assets impossible to load from the task/repository directory; public verifier assets remain task-local. Worktrees remain repository isolation, not a host sandbox; tasks can claim hidden verification only with the external vault path.
- Remaining work: mined task construction and review begin in `EVAL-06`; protected scoring/config and split leakage checks remain `EVAL-10`.
- Next recommended task: `EVAL-06`.

## 2026-07-22 — EVAL-06 Local Git-history task miner

- Status: DONE
- Goal: select and reconstruct local history candidates with exact provenance, deterministic suitability filters, and mandatory user review.
- Changes: added public mined-candidate contracts and a local Git miner with exact commit/range selection, privacy-safe author/body hashes, changed-file status/category/binary evidence, implementation/test/reference patch separation and hashes, explicit query/tool provenance, deterministic exclusions, disposable parent reconstruction plus patch-apply verification, create-only `.patchrace/mined` artifacts, CLI routing, and review-required output.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 21 test files/68 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Real Git histories cover eligible reconstruction, root, merge, implementation-only, binary, sensitive, bounded range, invalid limits, author-email non-disclosure, worktree-list restoration, uncommitted-file preservation, CLI JSON isolation, and create-only candidate persistence.
- Decisions/risks: no dependency or ADR change. The miner never executes repository code or accepts a candidate; reference/test patches remain local review artifacts, and hidden verifier acceptance still requires the external-vault path from `EVAL-05`.
- Remaining work: optional user-authenticated GitHub enrichment begins in `EVAL-07`; validity/flakiness and leakage gates remain `EVAL-09..10`.
- Next recommended task: `EVAL-07`.

## 2026-07-22 — EVAL-07 Optional GitHub PR/issue metadata miner

- Status: DONE
- Goal: optionally enrich local candidates through user-controlled `gh` authentication while preserving local-only operation as the default.
- Changes: added public GitHub metadata contracts and an opt-in `gh` provider with bounded process output, normalized health/auth readiness, repository discovery, commit-associated PR plus closing-issue extraction, strict response parsing, query/response hashes, atomic per-commit cache, cache-only replay, unavailable reasons, CLI persistence, and no token/auth-store reads or values in evidence.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 22 test files/70 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Injected protocol tests cover available PR/issues, exact cache reuse with zero second invocation, unavailable auth, malformed responses, and token-free cache content; default CLI mining remains network-independent.
- Decisions/risks: no dependency or ADR change. Existing `GH_TOKEN`-family environment values may be passed only by name to the official `gh` process and are never inspected or persisted. Unavailable GitHub data is supplemental, not task invalidity.
- Remaining work: deterministic split protection begins in `EVAL-08`.
- Next recommended task: `EVAL-08`.

## 2026-07-22 — EVAL-08 Train/validation/holdout split

- Status: DONE
- Goal: create deterministic category-aware task splits and keep final holdout membership unavailable to candidate generation.
- Changes: added public split/optimization-view/holdout-access contracts and the versioned `category-hash-v1` implementation; validated immutable task identities, categories, ratios, and duplicates; committed seed/task-set/assignment/category/holdout hashes; guaranteed all three memberships for sufficiently large categories; added manifest verification, holdout-hidden optimizer views, phase-specific access checks, and separately hashed final-gate opening records.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 23 test files/73 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Tests prove input-order independence, per-category representation, task-hash sensitivity, no holdout IDs in optimization JSON, cross-phase refusal, final-gate validation, ratio/duplicate rejection, and manifest tamper detection.
- Decisions/risks: no dependency or ADR change. The full coordinator manifest remains protected state; only its commitment and count enter candidate-generation views. One-time repeated-holdout policy remains the later teaching-protocol gate, while M5 records every opening.
- Remaining work: task validity/flakiness checks begin in `EVAL-09`.
- Next recommended task: `EVAL-09`.

## 2026-07-22 — EVAL-09 Flaky and invalid task detection

- Status: DONE
- Goal: replay baseline/reference evidence repeatedly and reject tasks that are solved, impossible, unstable, drifted, or environment-dependent.
- Changes: added public validity attempt/report contracts and fresh-worktree replay for setup, public/hidden verifier, assertions, and reviewed reference patches; revalidated every hashed task input before each replay; fingerprinted setup commands/repository state and verifier outcomes; separated baseline-already-passes, reference-never-passes, patch-apply failure, task drift, stable environment/setup failure, infrastructure error, and nondeterministic baseline/reference/setup findings; content-addressed reports and exact worktree cleanup.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 24 test files/76 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Real Git fixtures prove eligible fail/pass separation, already-solved and impossible invalidity, alternating outcome flake detection, stable setup invalidity, exact reference hashing, zero leftover replay worktrees, and unrelated-state preservation.
- Decisions/risks: no dependency or ADR change. Volatile wall-clock/test-runner text is not treated as correctness flake; deterministic command status, repository setup state, assertions, and repeated outcomes are authoritative, while additional output drift is only caveated.
- Remaining work: protected scoring/config and split/hidden leakage integrity begins in `EVAL-10`.
- Next recommended task: `EVAL-10`.

## 2026-07-22 — EVAL-10 Leakage and grader-integrity checks

- Status: DONE
- Goal: make grading fail explicitly when immutable inputs, protected state, hidden verifier secrecy, or dataset split authorization is compromised.
- Changes: added public grader-integrity finding/result contracts and a pre-grade checker that revalidates task/config commitments, worktree owner and baseline HEAD, every referenced content hash, split-phase access, protected and ignored paths, hidden mount collisions, Agent-visible roots and prompt surfaces, and bounded changed-file content. Results retain only logical/repository-relative evidence, hashes, indices, and match kinds; hidden bytes and absolute vault paths are not persisted. Hard violations become `compromised`, inspection gaps become `unknown`, and hidden verification on an ordinary host worktree always records the explicit filesystem-isolation limitation.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 25 test files/80 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Real Git fixtures cover a valid enforced boundary, host-only unknown status, ignored scoring-file mutation, forged hidden mounts, prompt/hash disclosure, copied hidden content, task/config/reference drift, visible vault roots, split misuse, evidence non-disclosure, exact cleanup, and unrelated-state preservation.
- Decisions/risks: no dependency or ADR change. `enforced-filesystem` is a caller assertion that must originate in a real execution-boundary capability; worktree containment alone never satisfies it. The checker does not claim detection of unknown transformed/encoded secret variants and therefore complements, rather than replaces, enforced isolation.
- Remaining work: repeated-run statistics begin in `EVAL-11`; the reference suite and M5 review will exercise this gate end to end.
- Next recommended task: `EVAL-11`.

## 2026-07-22 — EVAL-11 Repeated-run statistics

- Status: DONE
- Goal: summarize repeated exact-task/variant outcomes without hiding invalid trials or overstating small, dependent samples.
- Changes: added public repeated-observation/statistics contracts and deterministic aggregation with exact eligible/passed/failed/excluded counts, correctness-denominator integrity enforcement, finite-sample without-replacement `pass@k`, independent plug-in `pass^k`, Bernoulli sample variance and standard error, 95% Wilson intervals, sorted failure categories/trial IDs, source/report hashes, and explicit small-sample, variance, independence, exclusion, and no-data caveats. Duplicate IDs, invalid passes, ambiguous categories, and infeasible `k` values fail validation.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 26 test files/84 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Known-value tests cover mixed samples, all-pass/all-fail boundaries, completely unavailable evidence, compromised/unknown integrity exclusions, deterministic input ordering, invalid inputs, and stable estimator values.
- Decisions/risks: no dependency or ADR change. `pass^k` is deliberately labeled a scenario under declared independence rather than a confidence bound; samples below 30 always carry a caveat, and non-valid trials remain visible without being converted into Agent failures.
- Remaining work: the EVAL-12 reference suite will consume all M5 grading surfaces before the exit review.
- Next recommended task: `EVAL-12`.

## 2026-07-22 — EVAL-12 Replay reference suite

- Status: DONE
- Goal: create a reviewable, deterministic suite of at least ten tasks that jointly exercises the complete M5 task/grader surface.
- Changes: added a versioned ten-recipe reference inventory spanning JavaScript, Python, and repository-configuration ecosystems with logic, text, boundary, configuration, and documentation categories; nine expected-eligible tasks, one deterministic alternating flake, and three external hidden verifiers. The replay reconstructs fresh Git baseline/reference commits, immutable tasks and patches, manual initialization, public/hidden commands and assertions, validity replays, local mining, category-aware split views, host-integrity limitations, repeated-run statistics, unrelated-state preservation, and zero leftover owned worktrees. Added `pnpm m5:reference` plus an audit table and boundary notes.
- Verification: `pnpm m5:reference` passed its complete ten-task replay in isolation; `pnpm check` passed Prettier, ESLint, strict TypeScript, 27 test files/85 tests, fixture gates, and build/schema generation; `pnpm release:pack` passed all nine packages. Results were 9 eligible, 1 reproducibly flaky, 3 hidden-verifier tasks, 3 ecosystems, one eligible review-required mined candidate, complete ten-task split assignment, and deterministic statistics/integrity hashes.
- Decisions/risks: no dependency or ADR change. Dynamic temporary Git commits avoid embedding machine-specific SHAs while the checked-in recipe manifest preserves reviewability. Because the fixture host is not sandboxed, the hidden-integrity check must and does return `unknown`; it validates mechanics and disclosure detection without claiming host filesystem enforcement.
- Remaining work: `EVAL-13` audits all M5 invariants and closes the milestone only after the dedicated exit gate and full repository checks pass.
- Next recommended task: `EVAL-13`.

## 2026-07-22 — EVAL-13 M5 task/grading review

- Status: DONE; M5 passed 13/13 tasks
- Goal: audit and close the task/grading milestone only if reference replay, deterministic correctness, split/holdout protection, leakage behavior, packaging, and safety documentation all pass.
- Changes: added `M5_REVIEW.md` with task-by-task evidence, correctness/leakage analysis, reference results, verification, residual limitations, and the M6 entrance decision; added `scripts/verify-m5.mjs` plus `pnpm m5:verify`; reconciled M5 mitigation evidence and residual host/sample risks in `RISKS.md` and `THREAT_MODEL.md`; audited required task/contract/test/schema/Changeset/package artifacts and closed all thirteen ledger rows together.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 27 test files/85 tests, seven base fixtures, four intentional quality failures, and build/schema generation. `pnpm m5:verify` reran the ten-task reference suite, then passed all 13 ledger rows, 11 task modules/tests, 7 public contract modules, 10 recipes/3 ecosystems/3 hidden verifiers/1 deliberate flake, progress/review/architecture/Changeset controls. `pnpm release:pack` passed all nine publishable packages. No paid/credentialed call, network upload, secret retrieval, or global Pi mutation occurred.
- Decisions/risks: no ADR or dependency change. M5 passes because the system refuses false integrity claims: hidden injection and exact leakage gates work, but ordinary host execution stays `unknown` until an actual filesystem-enforcing backend exists. Small-sample and independence uncertainty remain mandatory statistics caveats. `R-006` and `R-008` remain open with materially completed M5 mitigations and later owners.
- Remaining work: M5 has no remaining task. M6 comparison orchestration must compose M5 hard gates without converting `unknown`/`not_graded` evidence into success.
- Next recommended task: `CMP-01`.

## 2026-07-23 — CMP-01 Race orchestration

- Status: DONE
- Goal: freeze identical task snapshots across selected variants and execute bounded trials without collapsing model, harness, or workflow identity.
- Changes: added public race task/variant/plan/trial/execution contracts; implemented deterministic variant hashing, order-independent plan identity, injected trial-ID allocation, repetition and pre-execution max-trial enforcement, explicit attempt lineage, and shared scheduler/budget execution with retained per-trial outcomes.
- Verification: the focused orchestration coverage passed as part of 28 test files/88 tests, and `pnpm typecheck` passed. Tests use an injected executor and made no Agent, credential, network, or paid call.
- Decisions/risks: no dependency or ADR change. The core owns durable generic orchestration while concrete adapters and graders remain injected across the existing dependency boundary; unavailable usage remains unavailable rather than zero.
- Remaining work: correctness-first aggregation and ranking begin in `CMP-02`; durable artifact integration and the public demo remain later M6 work.
- Next recommended task: `CMP-02`.

## 2026-07-23 — CMP-02 Correctness-first ranking

- Status: DONE
- Goal: rank comparable variants only after deterministic correctness/integrity gates, with configurable secondary objectives and visible raw evidence.
- Changes: added public ranking policy, aggregate, and ranked-comparison contracts; implemented validity-aware hard-gate aggregation, all-pass and pass-rate ordering, configured stability/cost/latency/footprint lexicographic comparison, deterministic ties, unavailable metrics, exclusions, and small-sample caveats.
- Verification: 29 test files/90 tests passed, including regression coverage proving a cheaper failed variant cannot outrank a correct variant; `pnpm typecheck` passed. No model or network call occurred.
- Decisions/risks: no dependency or ADR change. Secondary metrics compare only when both values are available, missing values are never zero, and the result explicitly limits claims to the evaluated task/configuration.
- Remaining work: terminal progress begins in `CMP-03`; report rendering will consume the same raw and ranked views.
- Next recommended task: `CMP-03`.

## 2026-07-23 — CMP-03 Terminal progress view

- Status: DONE
- Goal: expose readable live race state without destructive terminal updates or contamination of machine output.
- Changes: added a public progress-event contract and terminal presenter covering planned, preparing, running, grading, completed, failed, cancelled, budget-exhausted, and interrupted states; output is append-only, control characters are neutralized, counts and sequences are validated, duplicate terminal events are refused, and machine mode emits nothing.
- Verification: 30 test files/94 tests passed, including interruption, ANSI/control sanitization, duplicate-terminal refusal, deterministic formatting, and stderr/stdout separation; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. The presenter consumes injected durable progress and never owns coordinator state.
- Remaining work: the standalone report begins in `CMP-04`.
- Next recommended task: `CMP-04`.

## 2026-07-23 — CMP-04 Static HTML report

- Status: DONE
- Goal: derive a stable report from durable race/ranking evidence and render it locally without a server or active remote content.
- Changes: added the public comparison-report contract, source/ranking consistency validation, bounded claim and caveat aggregation, and a deterministic standalone HTML renderer for overview, correctness-first ranks, raw metrics, hard gates, evidence links, caveats, and provenance. All untrusted values are escaped; unsafe artifact links degrade to text; CSP denies scripts, objects, forms, bases, and all default resource loading.
- Verification: 31 test files/96 tests passed, including deterministic rendering and HTML/script injection fixtures; `pnpm typecheck` passed. No network or browser server was used.
- Decisions/risks: no dependency or ADR change. Stable report JSON remains primary and HTML is a pure derived view; artifact references are links only when they are safe relative logical paths.
- Remaining work: patch inspection begins in `CMP-05`.
- Next recommended task: `CMP-05`.

## 2026-07-23 — CMP-05 Side-by-side patch comparison

- Status: DONE
- Goal: let users inspect bounded patch evidence in unified and aligned forms while preserving protected-path and reference-patch boundaries.
- Changes: added a public patch-comparison contract and inert diff presenter with sorted changed-file inventory, protected-path flags, unified evidence, hunk-aware side-by-side context/add/remove/change/metadata rows, byte truncation, binary markers, and phase-authorized reference inclusion. Withheld reference bytes are absent from serialization.
- Verification: 32 test files/99 tests passed, covering aligned text changes, protected-path evidence, withheld/authorized references, binary markers, and oversized truncation; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Display code never applies or executes a patch; callers must establish reference-patch phase authorization.
- Remaining work: normalized cross-vendor trajectory presentation begins in `CMP-06`.
- Next recommended task: `CMP-06`.

## 2026-07-23 — CMP-06 Normalized trajectory timeline

- Status: DONE
- Goal: align cross-vendor observable activity without fabricating missing events or reconstructing hidden reasoning.
- Changes: added public trajectory lane/timeline contracts and a deterministic normalizer view for file, search, command, edit, test, and error lanes; semantic targets align across variants while event IDs, per-trace sequence, availability, timing, and raw references remain attached. Missing lanes are explicit unavailable markers and bounded displays report truncation.
- Verification: 33 test files/101 tests passed, including Pi/Codex cross-vendor alignment, missing-lane labels, source-order normalization, and truncation; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Only normalized observable events enter the timeline; absence is labeled unavailable and never interpreted as evidence that an action did not occur.
- Remaining work: machine report formats begin in `CMP-07`.
- Next recommended task: `CMP-07`.

## 2026-07-23 — CMP-07 Machine-readable report formats

- Status: DONE
- Goal: support automation and CI ingestion from stable outputs without scraping the HTML presentation.
- Changes: added canonical schema-versioned JSON serialization, deterministic JUnit XML test cases with escaped failure/skipped evidence, and SARIF 2.1.0 hard-gate/integrity findings. Failed deterministic gates remain failures, while unavailable/unknown evidence is represented as skipped rather than fabricated failure or success.
- Verification: 34 test files/104 tests passed, covering deterministic JSON, XML injection escaping/counts, and SARIF gate findings; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Machine formats derive from the same report model and emit no human progress on stdout.
- Remaining work: durable baseline/regression comparison begins in `CMP-08`.
- Next recommended task: `CMP-08`.

## 2026-07-23 — CMP-08 Baseline and regression comparison

- Status: DONE
- Goal: persist accepted comparison evidence and compare candidates with explicit, correctness-first promote/hold/reject inputs.
- Changes: added public baseline/regression contracts, validated baseline creation, create-new canonical persistence, current-schema reads, pure supported legacy migration views without source rewrite, task/policy comparability checks, raw correctness/stability/cost/latency/footprint deltas, unavailable-input lists, and explicit decision reasons. Correctness regression rejects; incomplete/incomparable or secondary regressions hold; only complete non-regression promotes.
- Verification: 36 test files/109 tests passed, covering create-new preservation, legacy read migration, correctness rejection, incomplete/incomparable hold, and complete non-regression promotion; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. A baseline file is never overwritten, migration is a derived view, and a promote result is only an input to later explicit promotion.
- Remaining work: redacted report export begins in `CMP-09`.
- Next recommended task: `CMP-09`.

## 2026-07-23 — CMP-09 Shareable redacted report workflow

- Status: DONE
- Goal: produce an explicitly confirmed, separate shareable report tree without mutating or silently including raw private evidence.
- Changes: added a report-only export preview that validates regular bounded text files, computes source/export hashes and redaction findings, records default exclusions/residual warning, and commits the exact source/destination/selection. Execution requires literal confirmation, recomputes the preview to detect drift, and delegates to the create-new M3 redaction export; raw streams, prompts, patches, unselected artifacts, binaries, unsafe paths, existing targets, and in-place destinations are refused or excluded.
- Verification: 37 test files/111 tests passed, covering preview findings, confirmation refusal, redacted output, raw-byte preservation, raw selection refusal, and post-preview drift; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. A redacted label records configured scanning, not a guarantee that unknown secrets are absent; user review remains required before sharing.
- Remaining work: the public-safe three-Agent demo begins in `CMP-10`.
- Next recommended task: `CMP-10`.

## 2026-07-23 — CMP-10 Reproducible three-Agent demo

- Status: DONE
- Goal: provide a clean-build, public-safe Pi/Claude Code/Codex comparison with checked derived reports and no credentialed execution.
- Changes: added a deterministic demo generator and checked JSON, standalone HTML, JUnit, and SARIF artifacts for one frozen fixture task and three explicitly versioned captured-harness variants; added `pnpm m6:demo` byte-for-byte verification and documented the small-sample/captured-evidence boundary. During completion audit, replaced the lingering CLI placeholders with a real comparison composition service that loads reviewed configs/tasks, requires host-command trust, preflights local adapters, runs exact worktrees, setup/assets/Agent/normalization/public-or-hidden grading/assertions, captures durable evidence, emits terminal progress, cleans owned worktrees, builds reports, regenerates formats, and previews/confirms redacted exports.
- Verification: `pnpm m6:demo` built the workspace and verified 16 checked report/evidence artifacts. The real local fake-Pi integration passed adapter/process/worktree/grader/artifact/report/redaction/terminal/JSON boundaries twice (machine and human modes), retained one main Git worktree, and contributed to 38 test files/112 tests. No vendor Agent, credential, network, or paid call occurred.
- Decisions/risks: no runtime dependency or ADR change; the CLI gained only existing internal workspace dependencies. The public demo is captured fixture evidence, not a live vendor benchmark, and explicitly cannot establish universal Agent superiority. Hidden verifier runs remain integrity `unknown` on host-only execution.
- Remaining work: `CMP-11` must audit the complete milestone and run full quality/package gates.
- Next recommended task: `CMP-11`.

## 2026-07-23 — CMP-11 M6 comparison review

- Status: DONE; M6 passed 11/11 tasks
- Goal: close the comparison milestone only if configuration races, deterministic correctness, terminal/machine/static presentations, patch/trace evidence, baselines, redacted export, public replay, packaging, risks, and claim boundaries all pass.
- Changes: added `M6_REVIEW.md` with task-by-task evidence, end-to-end behavior, correctness/security/claim audit, residual limitations, and M7 entrance decision; added `scripts/verify-m6.mjs` plus `pnpm m6:verify`; reconciled M6 evidence and residual risks in `RISKS.md` and `THREAT_MODEL.md`; added the M6 Changeset and closed all eleven ledger rows. The completion audit also ensured every checked demo report link resolves to patch, grade, normalized trace, and result evidence; persisted sanitized invocation provenance and raw/trace indexes; serialized concurrent coordinator events; and connected `run --resume` to exact-identity, unstarted-only recovery with fail-closed partial-attempt handling.
- Verification: `pnpm check` passed Prettier, ESLint, strict TypeScript, 38 test files/116 tests, seven base fixtures, four intentional quality failures, and build/schema generation. The real CLI fixture also resumed two verified-unstarted trials under the frozen run identity and rejected a partial invocation before any duplicate Agent call; coordinator concurrency preserves contiguous event sequences. `pnpm m6:demo` byte-verified 16 public three-Agent artifacts. `pnpm m6:verify` passed 11 ledger rows, 25 required modules/tests/docs, three adapters/trials, twelve linked evidence files, four report formats, claim/security/project controls. `pnpm release:pack` passed all nine packages. No paid/credentialed call, Keychain access, network upload, telemetry, commit, or global Pi mutation occurred.
- Decisions/risks: no external runtime dependency or ADR change. M6 materially reduces report leakage, runaway budget, and misleading small-sample risks but does not close them; host execution is still not a sandbox, hidden integrity stays `unknown` without enforcement, and the demo remains captured fixture evidence rather than a live benchmark.
- Remaining work: M6 has no remaining task. M7 begins with an evidence-bounded failure taxonomy and must not override hard gates or infer private reasoning.
- Next recommended task: `DIA-01`.

## 2026-07-23 — DIA-01 Freeze Pi failure taxonomy

- Status: DONE
- Goal: freeze conservative, non-overlapping top-level categories for explaining Pi failures from observable evidence.
- Changes: added executable definitions for discovery, context, workflow, tool, verification, capability, and unknown; each category includes positive examples and explicit exclusions. Added deterministic precedence that considers operational and narrower deterministic causes before capability and requires unknown for insufficient/confounded evidence. Documented the boundary, confidence meanings, missing-event semantics, and hidden-reasoning prohibition in the diagnosis architecture contract.
- Verification: 39 test files/118 tests passed, including category completeness, examples/exclusions, unique precedence, and conservative capability/unknown ordering; `pnpm typecheck` passed. No model, credential, network, or paid call occurred.
- Decisions/risks: no dependency or superseding ADR. Capability is not a generic failure fallback, and missing vendor lanes never prove an action was skipped.
- Remaining work: deterministic trajectory features begin in `DIA-02`.
- Next recommended task: `DIA-02`.

## 2026-07-23 — DIA-02 Extract deterministic trajectory features

- Status: DONE
- Goal: reproducibly derive diagnosis inputs from normalized observable evidence without turning missing adapter data into false zeroes.
- Changes: added public feature/delta contracts and deterministic extraction for relevant-file coverage, repeated search signatures, failed commands, monotonic first-test timing, ordered test results, edit paths/line totals, and repeated command signatures. Added explicit lane declarations, trace completeness limitations, immutable trace citations, strict single-trial ordering validation, and right-minus-left cross-trial deltas.
- Verification: 40 test files/122 tests passed, covering all requested features, observed-zero versus unavailable behavior, unavailable delta propagation, event citations, and malformed ordering; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. A lane with no events produces zero only when the caller declares it observed; otherwise its feature is unavailable.
- Remaining work: semantic cross-Agent alignment begins in `DIA-03`.
- Next recommended task: `DIA-03`.

## 2026-07-23 — DIA-03 Implement cross-agent trajectory alignment

- Status: DONE
- Goal: align semantically comparable observable actions across adapters without requiring identical tool names or deriving private intent.
- Changes: added a public observable-alignment contract and deterministic alignment for file inspection/listing, search, test, other command, edit, and error actions. Paths and common test command wrappers normalize across adapters; each occurrence retains variant/trial, event ID, sequence, ordinal, availability, type, and raw reference. Groups distinguish cross-variant from single-variant evidence and missing action surfaces stay explicit.
- Verification: 41 test files/124 tests passed, covering Pi/Codex equivalence with different tools, package-manager command versus normalized test alignment, provenance/order, unsupported lanes, and exclusion of observable message content; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Semantic alignment states observable similarity only; it never asserts equal intent or hidden reasoning.
- Remaining work: high-confidence deterministic rules begin in `DIA-04`.
- Next recommended task: `DIA-04`.

## 2026-07-23 — DIA-04 Implement rule-based failure diagnosis

- Status: DONE
- Goal: produce high-confidence, evidence-linked failure diagnoses without allowing inference to alter deterministic results.
- Changes: added public finding/rule-diagnosis contracts and stable rules for observable tool errors, missing/stale verification tied to failed gates, search loops with incomplete relevant-file coverage, unchanged retries with command failures, and explicit instruction/constraint gates. Findings carry content-derived IDs, exact event/gate citations, alternatives, limitations, eligible mutation targets, confidence, and rule origin. Integrity/outcome/gates are frozen as facts; invalid/unavailable evidence suppresses narrower blame, and unmatched cases return low-confidence unknown.
- Verification: 42 test files/128 tests passed, covering multi-rule evidence citations, tool/constraint separation, immutable facts, invalid-integrity suppression, and conservative unknown fallback; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Rules prefer unclassified evidence over confident fabrication and do not infer missing actions from unavailable lanes.
- Remaining work: optional schema-bounded reflection begins in `DIA-05`.
- Next recommended task: `DIA-05`.

## 2026-07-23 — DIA-05 Implement reflective diagnosis provider

- Status: DONE
- Goal: allow optional bounded reflection over safer evidence without granting it authority over deterministic facts.
- Changes: added redacted evidence-bundle and reflected-diagnosis contracts plus an opt-in provider interface. The boundary passes only frozen facts, deterministic finding summaries, and an explicitly redacted allowlisted evidence bundle; records provider/model/version and canonical input hash; strictly validates categories, lengths, counts, fields, and citations; and returns only low-confidence hypotheses with no mutation targets beside the unchanged deterministic diagnosis.
- Verification: 43 test files/131 tests passed, covering redacted input capture, valid bounded hypotheses, immutable deterministic object, replacement-fact rejection, forged citation rejection, and invalid taxonomy rejection; `pnpm typecheck` passed. Only an in-memory provider stub ran—no credential, network, paid, or real model call.
- Decisions/risks: no dependency or ADR change. Reflection cannot promote a candidate or upgrade confidence without later deterministic corroboration.
- Remaining work: conservative workflow-versus-capability classification begins in `DIA-06`.
- Next recommended task: `DIA-06`.

## 2026-07-23 — DIA-06 Distinguish likely workflow and capability gaps

- Status: DONE
- Goal: distinguish actionable workflow/configuration evidence from likely model capability or insufficient data without encouraging unsupported mutation.
- Changes: added public identity/classification contracts and a conservative classifier. High-confidence deterministic actionable findings take precedence. Likely capability requires a valid failed focus trial, complete-enough evidence, no narrower actionable cause, and at least two valid successful peers matching task, adapter, harness, and workflow while differing in model. Sparse, invalid, incomplete, or confounded evidence remains insufficient.
- Verification: 44 test files/135 tests passed, covering deterministic precedence, repeated model-only capability evidence, confounded/sparse no-mutation, and partial-trace suppression; `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Capability is medium-confidence and task/variant-specific; capability and insufficient-evidence always expose empty mutation targets and `no-configuration-mutation`. Reflection cannot elevate classification.
- Remaining work: evidence-linked diagnosis reporting and CLI composition begin in `DIA-07`.
- Next recommended task: `DIA-07`.

## 2026-07-23 — DIA-07 Implement evidence-linked diagnosis report

- Status: DONE
- Goal: compose auditable findings into stable reports and expose them through a real diagnose workflow without rerunning paid or mutable work.
- Changes: added public multi-case report/artifact inventory contracts, fail-closed source/trial/hash/event/gate citation resolution, finding/alternative/reflection/no-mutation invariants, stable caveats, canonical JSON, and default-deny-CSP escaped HTML. Connected `patchrace diagnose` to durable execution/trace/grade/result artifacts, deterministic features/rules/alignment/classification, focus selection, JSON/HTML output, human stderr summaries, and create-new optional destinations. Unconfigured reflection refuses preflight.
- Verification: 46 test files/138 tests passed, including dangling-event rejection, inert HTML injection, and real local fixture race → diagnose replay with insufficient-evidence/no-mutation output; `pnpm typecheck` and `pnpm lint` passed. No Agent/grader rerun, provider call, credential, or network access occurred during diagnosis.
- Decisions/risks: no dependency or ADR change. Default diagnosis is pure deterministic replay; report evidence must resolve to the run inventory, and reflection remains unavailable until an approved provider is explicitly configured.
- Remaining work: maintainer-labeled quality measurement begins in `DIA-08`.
- Next recommended task: `DIA-08`.

## 2026-07-23 — DIA-08 Validate diagnosis quality on labeled cases

- Status: DONE
- Goal: quantify rule precision/coverage on maintainer labels and fail on unsafe or speculative diagnosis authority.
- Changes: added a public quality-report contract/evaluator and 21 public-safe maintainer-labeled synthetic cases—three materially varied scenarios for each taxonomy category. The evaluator reports exact high-confidence finding precision, case coverage, per-category support/correct cases, false positives, unclassified cases, and unsafe/speculative reasons; it freezes minimum 20 cases, all-category coverage, at least 80% precision, and zero unsafe findings.
- Verification: 47 test files/140 tests passed. Production feature/rule evaluation achieved 18/18 high-confidence predictions correct (100% precision), 18/21 case coverage (85.7%), zero false positives, and zero unsafe/speculative findings. The three capability labels remained deliberately unclassified until controlled peer evidence exists. A negative fixture proved missing evidence/alternatives, reflective authority, capability mutation, and overconfidence fail the gate. `pnpm typecheck` passed.
- Decisions/risks: no dependency or ADR change. Precision excludes unclassified cases but coverage exposes them; this implements the frozen policy that abstention is safer than confident fabrication.
- Remaining work: `DIA-09` must audit the complete milestone, full gates, packaging, risks, and actionable value beyond comparison.
- Next recommended task: `DIA-09`.

## 2026-07-23 — DIA-09 M7 diagnosis review

- Status: DONE; M7 passed 9/9 tasks
- Goal: close explainable diagnosis only if it adds auditable actionable value beyond comparison, meets the frozen precision threshold, preserves correctness/privacy boundaries, and packages cleanly.
- Changes: added `M7_REVIEW.md`, `scripts/verify-m7.mjs`, `pnpm m7:quality`, `pnpm m7:verify`, the M7 Changeset, and M7 risk/threat reviews; updated public package/root status documentation and closed all nine ledger rows. The audit confirms observable-only features/alignment, deterministic-fact precedence, strict redacted reflection, controlled capability/no-mutation behavior, fail-closed report citations, inert HTML, and real pure-replay CLI diagnosis.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 47 test files/140 tests, seven base fixtures, four intentional quality failures, and build/schema generation. `pnpm m7:quality` passed 21 cases with 18/18 (100%) high-confidence precision, 18/21 (85.7%) case coverage, zero false positives, and zero unsafe/speculative findings. `pnpm m7:verify` passed nine ledger rows, 26 required artifacts, taxonomy/quality thresholds, reflection/capability/evidence-link/HTML/CLI controls, Changeset, risks, threats, and progress. `pnpm release:pack` built and dry-packed all nine packages.
- Decisions/risks: no external runtime dependency or superseding ADR. `R-005` and `R-015` are materially reduced but remain open for M8 routing and representative real-repository/beta evidence. Diagnosis output remains local-sensitive and is not yet part of redacted shareable export. No provider, credential, Keychain, network, paid call, telemetry, commit, branch mutation, or global Pi mutation occurred.
- Remaining work: M7 has no remaining task. M8 begins with read-only Pi resource inventory and must preserve diagnosis no-mutation outcomes, evidence lineage, split/holdout boundaries, project-local staging, and explicit activation.
- Next recommended task: `TCH-01`.

## 2026-07-23 — TCH-01 Inventory and lint current Pi resources

- Status: DONE
- Goal: inspect current Pi guidance, skills, prompts, settings, extensions, and packages without mutating project or global state.
- Changes: added public resource inventory/lint contracts and a deterministic inventory service. It reads the project root plus only an explicitly supplied global resource root, records origin, precedence, hashes, byte/context estimates, active/shadowed/informational state, and selected duplicate, settings, frontmatter, bloat, secret, executable-content, symlink, and limit findings. Project resources outrank global resources, nested guidance has explicit precedence, extensions/packages are inventory-only, and output never includes resource content or absolute paths.
- Verification: focused inventory tests passed three cases covering project/global precedence and no mutation, secret/frontmatter/symlink findings without secret disclosure or traversal, and executable-resource exclusion from context cost; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Token cost is explicitly an estimate, global auth/config discovery is forbidden, and symlinks are reported rather than followed.
- Remaining work: diagnosis-to-mutation routing begins in `TCH-02`.
- Next recommended task: `TCH-02`.

## 2026-07-23 — TCH-02 Implement diagnosis-to-mutation routing

- Status: DONE
- Goal: turn only eligible deterministic findings into the narrowest safe mutation or an explicitly non-mutating recommendation.
- Changes: added public route contracts and deterministic routing. Stable repository constraints route to `AGENTS.md` guidance; discovery/workflow/verification procedures route to Skills unless an explicitly named, cited user invocation supports a prompt template; tool failures become manual readiness recommendations; controlled capability findings become model advice. Trial mismatches fail closed, and invalid integrity, insufficient evidence, reflection-only/low-confidence/uncited findings, and unsupported categories return `no-candidate`.
- Verification: seven focused inventory/routing tests passed, covering exact route classes, prompt invocation evidence, tool/capability recommendations, and invalid/insufficient no-mutation behavior; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Package installation, authentication, settings mutation from ambiguous tool errors, and capability-driven configuration changes remain prohibited.
- Remaining work: candidate snapshot and lineage contracts begin in `TCH-03`.
- Next recommended task: `TCH-03`.

## 2026-07-23 — TCH-03 Implement candidate format and lineage

- Status: DONE
- Goal: make every candidate a fixed, content-addressed mutation identity with complete proposal and evaluation lineage.
- Changes: added public candidate/file/evaluation contracts plus constructors for stable candidate snapshots and append-only evaluation records. Candidate identity covers baseline/parent, generator and optional model/prompt hash, route/diagnosis/evidence hashes, visible split and config hashes, exactly one declared mutation type, safe project-relative file operations, and correctness-first objectives; evaluation attempts append without changing candidate identity. Type-specific target allowlists exclude extensions, packages, arbitrary scripts, global paths, and traversal.
- Verification: ten focused inventory/routing/candidate tests passed, including stable identity, exact lineage, immutable append behavior, duplicate-attempt refusal, and forbidden path/route/operation rejection; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Candidate identity and evaluation history are intentionally separate so later trials cannot silently redefine the mutation under test.
- Remaining work: owned candidate staging and disposal begin in `TCH-04`.
- Next recommended task: `TCH-04`.

## 2026-07-23 — TCH-04 Implement safe candidate staging

- Status: DONE
- Goal: stage exact candidate artifacts project-locally without activating them, and make cleanup ownership-safe and reviewable.
- Changes: added create-new candidate staging under `.patchrace/candidates/<candidate-id>`, with owner/candidate/lint records, exact encoded before/after bytes, per-file and aggregate unified diffs, metadata, and hash verification against the fixed snapshot. State roots must resolve inside the project; symlinked components and path escapes fail closed. Added dry-run disposal plans that require the exact owner ID/hash again at execution and remove only that owned candidate root.
- Verification: six focused candidate/staging tests passed, covering diffable isolation with no `.pi` activation, collision refusal, non-project and symlinked state rejection, dry run, exact deletion, and unrelated sentinel preservation; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Staging uses directories rather than automatic Git branches in v0.1; it never commits, touches global Pi state, or rewrites an existing candidate.
- Remaining work: focused guidance candidate generation begins in `TCH-05`.
- Next recommended task: `TCH-05`.

## 2026-07-23 — TCH-05 Generate focused AGENTS.md candidates

- Status: DONE
- Goal: generate evidence-backed repository guidance changes without accumulating generic or unbounded instruction bloat.
- Changes: added a bounded deterministic guidance generator for one stable fact or explicitly selected conflict/bloat line removals. It requires a matching high-confidence deterministic route, preserves exact before/after/diff bytes and hashes, associates every change with source diagnosis/evidence, reports added/removed lines and before/after/token delta, rejects duplicate or sensitive/hidden-verifier facts, and enforces declared line/context budgets.
- Verification: six focused generation/staging tests passed, covering cited fact addition, exact diff, conflict-only removal, token savings, duplicate/secret/budget refusal, and unchanged staging safety; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. The generator does not invent repository facts; a caller must supply the bounded fact or exact removal lines backed by the routed deterministic evidence.
- Remaining work: declarative Skill generation begins in `TCH-06`.
- Next recommended task: `TCH-06`.

## 2026-07-23 — TCH-06 Generate Pi skill candidates

- Status: DONE
- Goal: encode cited repeatable procedures as narrow declarative Skills without generating executable payloads or leaking task/version details.
- Changes: added a deterministic `SKILL.md` generator with lowercase slug, bounded description, explicit `Use when` trigger, two-to-eight bounded workflow steps, valid frontmatter, exact create diff/hashes, evidence linkage, and line/context budgets. It rejects code fences, inline command payloads, installers/downloaders, hooks/extensions, secret/hidden/reference terms, absolute personal paths, PatchRace-specific text, and semantic-version strings.
- Verification: five focused generator tests passed, covering valid Skill structure, exact target/evidence, no executable content, and project/version/broad-trigger rejection; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. v0.1 Skills contain Markdown instructions only; generated references/scripts and executable Extensions remain outside the allowed mutation surface.
- Remaining work: explicitly invoked prompt-template generation begins in `TCH-07`.
- Next recommended task: `TCH-07`.

## 2026-07-23 — TCH-07 Generate prompt-template candidates

- Status: DONE
- Goal: generate reviewable project-local prompts only for repeatable workflows the user actually invoked.
- Changes: added a bounded prompt-template generator that requires the route's invoked-workflow name to match the prompt slug, documents explicit user invocation, zero-to-eight typed arguments, required/optional status, declared placeholders, and two-to-ten workflow steps. Exact create diff/hashes, source evidence, and context/line cost are retained. Undeclared or unused required arguments, unsafe automatic actions, executable/installer text, secrets, and mismatched invocation fail closed.
- Verification: seven focused generator tests passed, covering valid prompt frontmatter/invocation/typed arguments/evidence and rejection of unevidenced invocation, undeclared placeholders, and automatic execution; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Prompt templates remain user-invoked Markdown proposals and never execute during generation or staging.
- Remaining work: inert settings/model/tool recommendations begin in `TCH-08`.
- Next recommended task: `TCH-08`.

## 2026-07-23 — TCH-08 Generate settings/model/tool recommendations

- Status: DONE
- Goal: make capability-aware configuration advice diffable while ensuring advice cannot install, authenticate, or activate anything.
- Changes: added a public inert recommendation contract plus settings, model, and tool generators. Settings use a small non-auth/non-package/non-extension allowlist and require a cited settings route; model advice requires the controlled capability route and calls for a same-task/adapter/harness/workflow comparison; tool advice requires the manual-tool route and accepts prose only. All outputs include canonical before/proposed diffs, evidence, warnings, `manualOnly: true`, and an empty auto-action list.
- Verification: ten focused generation/recommendation tests passed, covering capability-aware model diff, inert tool readiness, settings allowlist, and secret/package/install-command rejection; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Recommendations are not candidate file writes and cannot carry credential values or executable actions.
- Remaining work: unified candidate review and explicit decisions begin in `TCH-09`.
- Next recommended task: `TCH-09`.

## 2026-07-23 — TCH-09 Implement candidate review UI

- Status: DONE
- Goal: put complete source, diff, risk, effect, and cost evidence in front of an explicit approve/reject gate.
- Changes: added a public candidate-review contract, review builder, terminal decision transition, canonical JSON renderer, and standalone inert HTML. Review verifies every source diagnosis and patch hash, exposes exact unified diffs, security flags, expected effect, line/context cost and limitations, and begins with both decisions available while validation/activation are disabled. Explicit approval enables validation only; rejection is terminal; neither path enables activation. HTML escapes all untrusted content under a default-deny CSP.
- Verification: three focused optimizer/report review tests passed, covering complete review fields, exact diff evidence, explicit single terminal decision, validation-only approval, activation disabled, canonical JSON, CSP, and script/image injection escaping; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Static HTML controls are a presentation of the decision choices; the typed review transition is the source of truth and remains separate from later promotion confirmation.
- Remaining work: one-variable ablation planning and contamination checks begin in `TCH-10`.
- Next recommended task: `TCH-10`.

## 2026-07-23 — TCH-10 Implement one-variable ablation runner

- Status: DONE
- Goal: compare an approved candidate against its exact baseline with no undeclared resource difference.
- Changes: added public frozen ablation-plan/execution contracts, deterministic paired planning, balanced arm order across repetitions, environment-name-only provenance, pre-execution resource snapshot validation, and a callback-based runner that records partial outcomes. Plans freeze task snapshots, adapter/version/model/harness, budgets, scheduler, baseline/candidate resource hashes, declared variable, and exact mutation files. Missing/drifted or extra resource changes are safety failures before any evaluator call.
- Verification: five focused ablation/review tests passed, covering sorted frozen tasks, balanced order, exact one-variable acceptance, hidden extra-change refusal before evaluator invocation, and completed paired outcomes; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. The runner is provider-neutral and invokes only a caller-supplied evaluator under an AbortSignal; no Agent, credential, network, or paid call occurred.
- Remaining work: immutable train/validation/final-holdout access control begins in `TCH-11`.
- Next recommended task: `TCH-11`.

## 2026-07-23 — TCH-11 Enforce train/validation/holdout protocol

- Status: DONE
- Goal: keep proposal, selection, and the one-time final holdout as auditable non-overlapping authorities.
- Changes: added public teaching evidence/gate/ledger contracts and task-owned protocol services. Proposal views include only training evidence plus validation IDs and a holdout count/commitment; selection accepts validation evidence only. Every access is content-addressed and logged. Final holdout requires a frozen candidate/policy, reveals IDs only through one recorded gate, refuses a second opening, records a terminal outcome with `retuneAllowed: false`, and blocks any later proposal/selection access on that manifest.
- Verification: six focused teaching/split tests passed, covering hidden holdout identities, train/validation separation, cross-split rejection, frozen one-time access, terminal failure logging, and retuning refusal; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. A failed holdout can start another optimization cycle only after retiring this holdout and reserving an independently hashed split manifest.
- Remaining work: budgeted successive halving begins in `TCH-12`.
- Next recommended task: `TCH-12`.

## 2026-07-23 — TCH-12 Implement budgeted successive halving

- Status: DONE
- Goal: screen weak candidates cheaply and spend more evidence only on survivors inside a hard search envelope.
- Changes: added public successive-halving plan/decision contracts, deterministic multi-round allocation, sorted tasks/candidates, increasing task and repetition evidence, and explicit candidate/trial/wall/token/cost budgets with enforceable per-trial bounds. Round decisions reject hard-gate regressions first, use only the declared correctness screen to choose survivors, label weaker candidates `fullyEvaluated: false`, retain raw consumed dimensions, and refuse invalid, unenforceable, insufficient, or exceeded budgets.
- Verification: six focused halving/ablation tests passed, covering cheap first round, increased survivor allocation, hard-gate-first rejection, deterministic early stopping, and unenforceable/too-small budget refusal; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Early stopping is explicitly not a full evaluation or a promotion decision; multi-objective validation remains in `TCH-13`.
- Remaining work: correctness-first Pareto selection begins in `TCH-13`.
- Next recommended task: `TCH-13`.

## 2026-07-23 — TCH-13 Implement Pareto candidate selection

- Status: DONE
- Goal: select candidates with correctness-first multi-objective evidence without hiding tradeoffs in one aggregate score.
- Changes: added public provenance-bearing objective metric/vector, frozen decision policy, and Pareto selection contracts. Success rate, stability variance, cost, latency, footprint, context, and configuration complexity retain availability, units, counts, task/repetition support, variance/interval, and artifact hashes. Selection rejects hard-gate and threshold regressions first, holds unavailable required metrics, compares only compatible validation vectors, and reports the undominated frontier and exact dominators/reasons.
- Verification: six focused Pareto/halving tests passed, covering two tradeoff frontier candidates, explicit domination, hard-gate/correctness/complexity rejection, unavailable-metric hold, and no hidden aggregate rationale; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Cost may be unavailable and can never be rewritten as zero; Pareto eligibility is a recommendation under a frozen policy, not activation authority.
- Remaining work: explicit promotion and exact rollback begin in `TCH-14`.
- Next recommended task: `TCH-14`.

## 2026-07-23 — TCH-14 Implement promote and rollback

- Status: DONE
- Goal: apply only an explicitly approved, validated project-local candidate and guarantee conflict-safe restoration of its exact preimage.
- Changes: added public promotion/record/rollback contracts and read-only promotion/rollback previews. Promotion validates candidate/review/Pareto/policy lineage, requires a matching passed one-time holdout for held-out policies, verifies staged bytes and current preimages, refuses traversal/symlink/global targets, writes a local private provenance/preimage record, and applies only declared targets after confirmation with failure compensation. Rollback revalidates every current postimage, refuses divergence or reuse, restores exact preimages after confirmation, and records the terminal rollback.
- Verification: three focused filesystem tests passed, covering zero-write preview, explicit promotion, exact rollback, unrelated sentinel preservation, second-rollback refusal, user-divergence preservation, symlink refusal, and held-out-gate enforcement; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Promotion never commits, pushes, publishes, installs, writes global Pi state, or treats review approval as activation authority.
- Remaining work: compose the full `patchrace teach pi` workflow in `TCH-15`.
- Next recommended task: `TCH-15`.

## 2026-07-23 — TCH-15 Implement patchrace teach pi end-to-end

- Status: DONE
- Goal: replace the teaching placeholder with one bounded, phase-addressable orchestration path from durable diagnosis through promotion preview.
- Changes: added a CLI teaching service and real `teach pi` routing with `diagnose|propose|screen|validate|report|all` phases. It replays durable diagnosis, inventories resources, routes and generates a bounded candidate or inert recommendation, stages exact artifacts, emits escaped review JSON/HTML, stops for explicit approval, freezes budgeted screening and one-variable validation, delegates actual trials only to an explicitly configured evaluator, applies Pareto policy, writes a canonical teaching report, and returns a promotion dry-run request only for eligible evidence. Added CLI options for phase, fact/workflow, expected effect, frozen improvement threshold, budget, and review approval/reason; added the optimizer workspace dependency and lockfile link.
- Verification: seven focused teaching/CLI tests passed, including full deterministic diagnose→proposal→approval→screen→ablation→validation→Pareto→promotion-preview composition, zero project-resource activation, pending-review evaluator suppression, separate side-effect-free diagnosis, and existing CLI routing; strict TypeScript and focused ESLint passed.
- Decisions/risks: no runtime dependency or ADR change. The default CLI has no implicit Agent evaluator: review works locally, but validation refuses until an evaluator is explicitly configured with budget/Agent authority. Tests used an in-memory deterministic evaluator only; no vendor, credential, network, or paid call occurred.
- Remaining work: the checked held-out Pi resource demo begins in `TCH-16`.
- Next recommended task: `TCH-16`.

## 2026-07-23 — TCH-16 Demonstrate held-out Pi improvement

- Status: DONE
- Goal: produce one reproducible non-trivial held-out Pi resource improvement under predeclared correctness, safety, and budget constraints.
- Changes: added a twelve-task two-category deterministic Pi package-manager guidance fixture, frozen split seed/baseline/candidate/thresholds, a complete checked demo runner, canonical expected output, `pnpm m8:demo`, and `M8_DEMO.md`. Proposal receives eight training IDs/evidence and only the holdout count/commitment; validation uses two tasks and freezes the candidate/policy; the final two-task gate opens once and disables retuning.
- Verification: `pnpm m8:demo` built the workspace and byte-matched the canonical report. Held-out success improved from 0.0 to 1.0 against a predeclared 1.0 threshold; all integrity/correctness/safety/protected-path gates passed; cost, latency, and footprint increases were zero; context estimate increased 20 within 50; config complexity increased 1 within 2; `retuneAllowed` is false.
- Decisions/risks: no dependency or ADR change. This is deterministic captured fixture evidence for the teaching/resource protocol, not a live Pi model-quality claim. No Agent, credential, provider, network, paid call, promotion, global Pi write, or project-resource activation occurred.
- Remaining work: `TCH-17` must audit the complete milestone, full gates, security/claims, packaging, risks, and control records.
- Next recommended task: `TCH-17`.

## 2026-07-23 — TCH-17 M8 teaching-loop review

- Status: DONE; M8 passed 17/17 tasks
- Goal: close the teaching milestone only if the full candidate lifecycle proves no leakage, silent activation, hidden aggregate manipulation, unsafe overwrite, or unsupported improvement claim.
- Changes: added `M8_REVIEW.md`, `scripts/verify-m8.mjs`, `pnpm m8:verify`, the M8 Changeset, M8 risk/threat reviews, public package/root documentation, and closed all 17 ledger rows. The audit confirms read-only inventory, conservative authority, bounded non-executable candidates, exact review/diffs, one-variable validation, one-time no-retune holdout, enforceable budgets, raw Pareto dimensions, explicit project-local promotion/rollback, and fixture-scoped claims.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 61 test files/184 tests, seven base fixtures, four intentional quality failures, and build/schema generation. `pnpm m8:demo` byte-matched the 8/2/2 split report with no proposal holdout IDs, success 0→1, all hard gates, zero cost/latency/footprint regression, context +20/50, complexity +1/2, and no retuning. `pnpm m8:verify` passed 17 ledger rows, 35 required artifacts, structural/security/claim gates, Changeset, risks, threats, and progress. `pnpm release:pack` built and dry-packed all nine packages.
- Decisions/risks: no new runtime dependency or superseding ADR. `R-004`, `R-005`, `R-007`, `R-008`, and `R-011` are materially reduced but remain open for live model/project evidence and hardening. No Agent/provider, credential, Keychain, paid call, telemetry, publication, commit, branch, global Pi, or candidate activation action occurred. One approved `pnpm install` refreshed locked development packages/workspace links after the offline store miss; no package bytes were downloaded.
- Remaining work: M8 has no remaining task. M9 begins by making the existing Pi extension package delegate to the stable core/teaching services without duplicating durable state or weakening confirmations.
- Next recommended task: `PI-01`.

## 2026-07-23 — PI-01 Scaffold Pi extension package

- Status: DONE
- Goal: turn the placeholder `pi-patchrace` workspace into a current, project-local Pi package that remains a thin delegate over PatchRace durable services.
- Changes: added the official `pi-package` manifest and compiled default extension entry, a watch plus `/reload` workflow, a no-shell argument-array bridge to `patchrace --json`, bounded output/error handling, structural Pi command/UI types, and schema-versioned session entries restored on `session_start`. `/patchrace doctor` now exercises the bridge without replacing the current Pi session or reading provider credentials.
- Verification: five focused extension tests passed for package metadata, command registration, exact argv/cwd isolation, incompatible-output refusal, session preservation, and reload restoration; full strict TypeScript passed.
- Decisions/risks: current official Pi documentation confirms project-local package trust, manifest paths, compiled JS extensions, `/reload`, and session persistence via custom entries. The package keeps Pi APIs structural and runtime-free; it requires the `patchrace` executable on PATH instead of reversing the frozen workspace dependency graph. No provider, credential, networked Agent, paid call, install, global Pi write, or activation occurred.
- Remaining work: `PI-02` adds the interactive race flow and explicit confirmation gates.
- Next recommended task: `PI-02`.

## 2026-07-23 — PI-02 Add Pi race command

- Status: DONE
- Goal: let a Pi user configure, start, and inspect a durable PatchRace comparison while preserving the current Pi session and all safety gates.
- Changes: added `/race` with an interactive suite/variant/repetition wizard, quote-safe explicit options, exact no-shell argv preview, mandatory confirmation for trusted repository commands and configured Agent budgets, live Pi status, durable custom-session state, completion inspection, and `/race inspect <run-id>` report replay. Parsing rejects unknown, duplicated, missing, malformed, and NUL-bearing inputs before execution.
- Verification: eleven focused extension tests passed across argument parsing, configuration, confirmation refusal, invocation isolation, persistence, inspection, package loading, and bridge failure behavior; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Starting a race remains an explicitly confirmed potentially paid/credentialed action; tests used only an in-memory bridge and performed no provider, Agent, credential, network, repository command, or paid call.
- Remaining work: `PI-03` renders evidence-linked diagnosis and keeps deterministic facts visually separate from optional hypotheses.
- Next recommended task: `PI-03`.

## 2026-07-23 — PI-03 Add Pi coach/diagnose command

- Status: DONE
- Goal: make diagnosis useful inside Pi without blurring deterministic authority and optional inference.
- Changes: added `/diagnose` and `/coach` over durable run evidence, last-run restoration, focus/state options, fail-closed artifact/hash citation resolution, separate hard-gate facts/rule findings/inferred-hypothesis sections, alternatives, limitations, classifications, and coach recommendations. Optional `--reflect` warns about redacted provider use and requires confirmation before invocation.
- Verification: seven focused extension tests passed for both commands, exact diagnosis argv, evidence rendering, deterministic/inferred separation, reflection refusal/confirmation, session state, and unresolved-citation rejection; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Reflection remains low-authority and cannot override facts or hard gates. Tests used only captured in-memory reports; no provider, credential, network, Agent, or paid call occurred.
- Remaining work: `PI-04` adds review, promotion, rejection, and rollback over exact candidate evidence.
- Next recommended task: `PI-04`.

## 2026-07-23 — PI-04 Add candidate review and promotion command

- Status: DONE
- Goal: expose the complete candidate authority boundary in Pi and connect preview-first promotion/rollback to the already hardened optimizer lifecycle.
- Changes: added durable CLI candidate review/decision services plus real `promote` and `rollback` routing; pending review evidence remains append-only while one terminal decision is added separately. Added Pi `/review`, `/promote`, and `/rollback` with hash-verified exact diffs, validation/selection evidence, safety flags, authority limits, explicit approve/reject actions, promotion/rollback previews, and second confirmations before project-local writes.
- Verification: ten focused CLI/Pi tests passed for exact diff display, invalid-hash refusal, validation/safety visibility, single terminal review decisions, zero-write previews, exact project-local promotion, unrelated sentinel preservation, exact rollback, and CLI command routing; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. Approval enables validation only; promotion requires stored approved and promote-eligible evidence under the frozen policy. Neither flow commits, pushes, publishes, installs, or touches global Pi state. Tests used temporary local fixtures only and made no provider, credential, network, Agent, or paid call.
- Remaining work: `PI-05` restores durable run status and report/artifact navigation after session lifecycle events.
- Next recommended task: `PI-05`.

## 2026-07-23 — PI-05 Add run status and report navigation

- Status: DONE
- Goal: restore and inspect durable PatchRace state inside Pi after reload, restart, or compaction without trusting mutable process memory.
- Changes: added `/status [run-id]` with saved-session restoration, newest-owned-run discovery, immutable manifest/execution summaries, artifact-index navigation, report prioritization, and safe TUI display. Navigation is restricted to project-local owned run roots and hash/size-verified text records; symlinked, escaped, binary, oversized, missing, and drifted artifacts fail closed.
- Verification: six focused status/extension tests passed for newest-run discovery, saved-run restoration, trial summaries, report navigation, session-pointer append, hash-drift refusal, and symlink refusal; strict TypeScript and focused ESLint passed.
- Decisions/risks: no dependency or ADR change. `/status` is read-only apart from a Pi custom session pointer and never reruns an Agent or grader. Tests used temporary durable artifacts only and made no provider, credential, network, Agent, or paid call.
- Remaining work: `PI-06` verifies Pi package install/update/filter/reload/uninstall compatibility without global-state mutation.
- Next recommended task: `PI-06`.

## 2026-07-23 — PI-06 Package-install and update compatibility tests

- Status: DONE
- Goal: prove the Pi package lifecycle without touching global Pi state, publishing, or depending on provider credentials.
- Changes: added typed local/git/npm package-source and project-scope plans, stable source identities, manifest-bounded extension filters, settings-preserving install/update/remove transforms, a provider-free `/patchrace reload`, and `pnpm pi:compat`. The real compatibility runner uses an isolated Pi config/project, constructed environment allowlist, offline mode, RPC command discovery, and exact cleanup.
- Verification: nine focused compatibility/extension tests passed. `pnpm pi:compat` built the package and passed on trusted local Pi 0.81.1: project-local install/trust, all eight extension commands, empty filter disable, exact filter re-enable, live reload, targeted local update, uninstall, unrelated setting/file preservation, and local/git/npm offline dry-run plans.
- Decisions/risks: no dependency or ADR change. Git/npm sources were planned only and never fetched; npm was not published. The real test did not use a model/provider, credential, Keychain, global Pi settings, telemetry, or paid call.
- Remaining work: `PI-07` runs the complete documented Pi UX and milestone review.
- Next recommended task: `PI-07`.

## 2026-07-23 — PI-07 M9 Pi UX review

- Status: DONE; M9 passed 7/7 tasks
- Goal: close the Pi-native milestone only if one documented user flow preserves session continuity, durable evidence, explicit authority, safe package scope, and exact rollback.
- Changes: added the complete one-session workflow test and guide, M9 review/verifier, real offline Pi compatibility gate, CLI candidate lifecycle documentation, M9 Changeset, and M9 risk/threat reviews. Closed all seven M9 rows and made `QA-01` dependency-ready.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 71 test files/215 tests, seven base fixtures, four intentional quality failures, and build/schema generation. `pnpm pi:compat` passed project-local install/trust, eight commands, filter/reload/update/remove on Pi 0.81.1. `pnpm release:pack` dry-packed all nine packages, and `pnpm supply-chain:licenses` passed seven production dependencies. `pnpm m9:verify` passed the workflow and all structural/safety/authority/package/docs/risk/threat gates.
- Decisions/risks: no new runtime dependency or superseding ADR. Pi Extensions/project trust remain full-host-permission mechanisms, not a sandbox. The checked workflow is deterministic bridge/temporary-filesystem evidence rather than live Agent quality evidence; real dogfood remains explicitly authorized later work. No provider, credential, Keychain, paid Agent, git/npm network fetch, telemetry, publish, global Pi write, commit, or push occurred.
- Remaining work: M9 has no remaining task. M10 begins with `QA-01`.
- Next recommended task: `QA-01`.

## 2026-07-23 — QA-01 Automated test pyramid

- Status: DONE
- Goal: prove the named unit, contract, integration, deterministic E2E, fixture, and reproducibility layers before release hardening proceeds, and close observable gaps instead of optimizing a vanity percentage.
- Changes: added the release-facing test matrix and invariant map; direct `CoreCommandService` doctor/cleanup tests; actionable rejection of cleanup without an explicit owned run/cache target; a real no-shell Pi child-process bridge regression; visible failure for corrupt owned run discovery; a full non-empty escaped diagnosis-report regression; and a compiled CLI child-process smoke that performs init, doctor, a two-variant race, JUnit report, diagnosis, cleanup preview, and exact cleanup in a fresh Git repository. Registered the smoke in `pnpm check`, added a QA verifier, and recorded the user-visible cleanup/status fixes in a Changeset.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 72 test files/222 tests, seven repository fixtures, four intentional quality failures, build/schema generation, and the compiled CLI smoke. `pnpm test:coverage` recorded 86.44% statements, 76.10% branches, 83.92% functions, and 85.10% lines. `pnpm m9:verify` re-passed the Pi 0.81.1 offline package lifecycle and seven-task workflow. `pnpm release:pack` produced all nine tarballs; extracted content contained no personal absolute paths, credential markers, or private-key markers. `pnpm supply-chain:licenses` passed seven production dependencies.
- Decisions/risks: no architecture or runtime-dependency change. Corrupt owned state now fails visibly instead of being misreported as absent. Coverage remains diagnostic, while named behavior is the gate. The built-product smoke uses a deterministic observable Pi JSON executable and no model/provider. A packed clean-consumer install was attempted offline and stopped because registry metadata for `commander` was not cached; the networked retry was not authorized, so no workaround or registry egress occurred.
- Remaining work: `QA-01` does not prove the macOS/Linux Node 22/24 matrix, live minimum/current Agent CLIs, full chaos/security/privacy/performance audits, a network-resolved clean consumer install, 50 dogfood runs, or five-user beta. Those remain explicit M10 tasks.
- Next recommended task: `QA-02`.

## 2026-07-23 — QA-02 Supported macOS and Linux environments

- Status: DONE
- Goal: prove clean source installation, packed-consumer installation, and the core compiled CLI workflow on the supported macOS/Linux and Node 22/24 matrix, with exact limitations and no false hosted-CI claim.
- Changes: added `pnpm qa:platform`, isolated clean-copy/fresh-workspace environment evidence, explicit `macos-15` and `ubuntu-24.04` CI labels, and platform support documentation. Reworked packed smoke to install all nine local tarballs as explicit npm dependencies with an isolated cache. Fixed the installed `patchrace` bin by canonicalizing npm's symbolic-link entry path, added its regression and Changeset, and gave the Git/process-heavy validity integration tests an explicit 20-second harness limit while retaining their five-second product verifier limits and all assertions.
- Verification: isolated macOS 26.3 arm64 cells passed Node 22.22.1 and 24.18.0 with Git 2.50.1/pnpm 10.34.5. Checksum-verified Ubuntu 24.04 images and official Node tarballs passed arm64 and true x86_64 kernel/userland cells on Node 22.22.1 and 24.18.0 with Git 2.43.0/pnpm 10.34.5. Every cell completed frozen install, 73 test files/224 tests, fixtures, intentional quality failures, build, nine-package dry-pack, npm consumer install, init → doctor → two-variant race → report → diagnose → cleanup preview/confirm, and primary/unrelated-worktree preservation. Final host `pnpm check`, `pnpm release:pack`, and `pnpm supply-chain:licenses` passed.
- Decisions/risks: no architecture or runtime-dependency change. GitHub-hosted jobs remain unclaimed because the repository has no commit or remote, but equivalent explicit OS/architecture/runtime cells ran locally. The user approved registry/image access and Homebrew QEMU 11.0.2 installation; Homebrew's default cleanup removed old bottle caches and superseded CA/OpenSSL versions before returning a cleanup-related exit 1, while QEMU and current dependencies passed health checks. Both Lima instances, their exact processes, 2.5 GiB temporary roots, and the task-created Lima cache were removed; QEMU remains installed. No Agent/provider, credential, paid call, telemetry, publish, commit, or push occurred.
- Remaining work: platform-specific chaos, live Agent CLI compatibility, performance, security/privacy, dependency/release audit, documentation, dogfood, and independent beta remain. Hosted CI must still produce its first repository-backed run before launch.
- Next recommended task: `QA-03`.

## 2026-07-23 — QA-03 Worktree and process chaos tests

- Status: DONE
- Goal: prove that dirty repositories, signals, crashes, stale leases, disk pressure, partial/corrupt artifacts, conflicting trial commits, and cleanup failures fail closed without damaging user state.
- Changes: added the release-facing `QA_CHAOS_MATRIX.md` and `pnpm qa:chaos`; exercised an exact temporary Git/process/artifact/cleanup matrix; changed recovery to preserve complete malformed event/index bytes and return `needsInspection`; changed cleanup to revalidate the planned run/worktree/cache owner and validate all non-worktree targets before deletion; added focused regressions and a core Changeset.
- Verification: `pnpm qa:chaos` passed 7 files/27 tests. `pnpm check` passed formatting, ESLint, strict TypeScript, 74 files/234 tests, seven repository fixtures, four intentional quality failures, build/schema generation, and compiled CLI smoke. `pnpm release:pack` dry-packed all nine packages; `pnpm supply-chain:licenses` passed seven production dependencies. The matrix preserved dirty/untracked primary files, conflicting worktrees, unrelated PIDs/files, stale leases, partial crash streams, tampered artifacts, and symlink destinations.
- Decisions/risks: no dependency or architecture change. `R-002` is materially reduced but remains open for malicious-repository/security review and real nondeterministic host failures. Worktrees remain non-sandbox isolation. No Agent/provider, credential, Keychain, paid call, network access, telemetry, publish, commit, or push occurred.
- Remaining work: QA-03 does not emulate every kernel/filesystem/power-loss/PID-reuse race. Those residuals are documented; QA-06 owns malicious-input/security review.
- Next recommended task: `QA-04`.

## 2026-07-23 — QA-04 Agent CLI compatibility tests

- Status: DONE
- Goal: verify selected minimum/current Pi, Claude Code, and Codex CLI profiles and prove version/stream drift fails actionably without corrupting evidence.
- Changes: added `QA_AGENT_COMPATIBILITY.md`, `pnpm qa:agents`, a bounded live version/help verifier with hashed-path evidence, minimum/current full-stream fixtures, lower/upper range assertions, and an adapters Changeset. Raised the Claude Code floor from 2.1.0 to 2.1.104 because 2.1.0 lacks the adapter-required non-mutating `auth status` command.
- Verification: official npm metadata selected Pi 0.81.0/0.81.1, Claude Code 2.1.104/2.1.218, and Codex 0.145.0. `pnpm qa:agents` passed 13 fixture tests and five exact live non-Agent profiles for version, JSON/stream-json, print/exec, resource/session/sandbox controls, and auth/login-status help; it wrote an ignored PASS summary without absolute paths or auth state. The local broken PATH Codex normalized to unavailable with repair remediation. `pnpm check` passed 74 files/237 tests, all fixtures, build, and compiled CLI smoke; all nine packages dry-packed and the seven-package production license inventory passed.
- Decisions/risks: `R-001` remains open because future releases can drift, but every advertised minimum/current profile now has executable and full-stream evidence. Registry access and exact temporary installs were approved; seven exact temporary prefixes, including interrupted partial installs, were permanently removed after verification and can be recreated from npm. No Agent prompt, provider, credential/auth-state read, Keychain access, paid call, telemetry, publish, commit, push, or global CLI mutation occurred.
- Remaining work: provider-side readiness and live task quality are deliberately not inferred from help/fixture checks; authorized dogfood owns those measurements. New minor lines remain unsupported until this matrix is rerun.
- Next recommended task: `QA-05`.

## 2026-07-23 — QA-05 Performance and resource benchmark

- Status: DONE
- Goal: measure PatchRace runner/report overhead, disk retention, concurrency, and large-trace behavior against the frozen v0.1 performance gates without mixing in Agent inference or repository installation.
- Changes: added `pnpm qa:performance`, a self-cleaning isolated benchmark, ignored machine-readable summaries, and `QA_PERFORMANCE.md`. The benchmark measures 2,000 scheduler no-op trials, 20 real Node process launches, 40 delayed jobs at concurrency 1/4, 100,000 normalized trajectory events, and a 51.35 MiB normalized comparison report written with its inert HTML.
- Verification: two independent reference runs passed. Scheduler median was 0.0248–0.0261 ms/trial with ≤0.0315 ms maximum sample; process-runner median was 32.18–32.95 ms and cold/maximum was ≤304.69 ms, all below the 2,000 ms absolute gate. Static report generation took 24.75–26.89 ms versus 10,000 ms; peak RSS was 485.02–485.05 MiB versus 750 MiB. Normalized JSON plus HTML retained 102.47 MiB versus the configured 2,048 MiB default disk budget. Four ready workers reached 5.03×–5.04× in the two documented runs, and 100,000 events truncated deterministically to 10,000. Final `pnpm check` passed 74 files/237 tests, fixtures, build, and compiled CLI smoke; all nine packages dry-packed and license inventory passed.
- Decisions/risks: no runtime dependency, published-package behavior, or Changeset. The absolute ≤2 seconds/trial gate is used because a zero-inference fixture has no meaningful 5% inference denominator. Whole-document report rendering is fast but uses about 485 MiB RSS, leaving about 265 MiB headroom; richer default report content triggers rebenchmarking. `R-007` remains open for real Agent cost/dogfood. No provider, credential, network, paid call, telemetry, publish, commit, or push occurred.
- Remaining work: the 102.47 MiB figure excludes raw vendor streams, sessions, patches, grades, and repeated variants; real run disk budgets and explicit cleanup remain authoritative. Beta activation timing is separate.
- Next recommended task: `QA-06`.

## 2026-07-23 — QA-06 Security review and threat model

- Status: DONE
- Goal: audit the implemented command, filesystem, malicious-repository, secret, generated-candidate, package, recovery, and cleanup boundaries and block completion on any unresolved critical/high defect.
- Changes: added the full `T-01..T-15` threat-to-control/test/residual matrix, QA-06 implementation threat-model and risk reviews, `pnpm qa:security`, and a structural verifier over production shell use, ten package manifests, no-follow file handling, cleanup ownership, inert reports, and generated-candidate boundaries. Found and fixed `QA06-F01`: artifact append/read, recovery, and ownership checks now use `O_NOFOLLOW` file handles and require regular files with one hard link. Added symbolic-/hard-link and cache-owner regressions that preserve external sentinels.
- Verification: `pnpm qa:security` passed 34 files/115 tests and scanned 104 production TypeScript files plus ten manifests with zero install lifecycle scripts or production `shell: true`. The npm advisory endpoint reported no known vulnerabilities. `pnpm check` passed formatting, ESLint, strict TypeScript, 74 files/239 tests, fixtures, build/schema generation, and compiled CLI smoke. `pnpm release:pack` dry-packed all nine packages; `pnpm supply-chain:licenses` passed seven production dependencies.
- Decisions/risks: no architecture or dependency change. No unresolved critical/high security defect is known, but PatchRace remains explicitly not a sandbox: trusted repository/Agent/Extension code has host authority, same-user directory races and host-only verifier visibility remain residuals, and unknown secret formats remain for QA-07. No provider, credential, Keychain, paid Agent, telemetry, publication, install, commit, push, or global Pi mutation occurred.
- Remaining work: `QA-07` independently tests privacy/redaction exports; `QA-08` independently rechecks dependency, license, provenance, and package release state.
- Next recommended task: `QA-07`.

## 2026-07-23 — QA-07 Privacy and redaction review

- Status: DONE
- Goal: prove that public export handles prompts, paths, credentials, source code, and personal data according to the local-first policy while keeping raw evidence immutable and scanner limits prominent.
- Changes: added a six-class malicious privacy fixture and review/verifier. Fixed five findings: raw-only literal matching now covers JSON/HTML encodings; the bounded transform emits no partial data; CLI export reloads the frozen config and consumes only explicitly named runtime redaction values; OTLP redacts typed sensitive fields before serialization; no-follow bounded handles read sources; and public comparison export now accepts only a separate projection with patches, paths, trajectories, executable/harness/workflow data, environment names, and free-text limitations removed. Added the four-package Changeset and architecture/privacy updates.
- Verification: `pnpm qa:privacy` passed 14 files/47 tests with five credential families, three personal-data classes, false-positive controls, raw-byte preservation, and an intentionally retained unknown format plus warning. `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build/schema generation, and compiled CLI smoke. `pnpm m6:verify` revalidated all 11 comparison tasks and 16 deterministic demo artifacts. `pnpm release:pack` dry-packed all nine packages; seven production dependency licenses passed.
- Decisions/risks: no dependency or ADR change. `R-003` remains open because unknown/transformed formats, images, binaries, archives, inferred data, and human error cannot be eliminated by scanning. Diagnosis/candidate output remains local-sensitive and not shareable. Preview paths are local-sensitive; publication is a separate user action. No provider, credential store, Keychain, paid Agent, telemetry, upload, publication, automatic deletion, commit, push, or global Pi mutation occurred.
- Remaining work: `QA-08` performs the independent dependency/license/provenance/package audit; `DOC-03` turns the reviewed security/privacy/cleanup boundaries into user documentation.
- Next recommended task: `QA-08`.

## 2026-07-23 — QA-08 Dependency, license, and release audit

- Status: DONE
- Goal: audit the final pre-publication dependency graph, licenses/notices, lock/registry integrity, lifecycle and update controls, package metadata/content/source maps, local tarballs, and provenance boundary without publishing.
- Changes: upgraded `release:pack` from a narrow blacklist to a nine-package allowlist with required license/README/entry/schema, dependency rewrite, lifecycle, bin/shebang, source-map, secret/path, and checksum checks. Expanded license inventory from seven production dependencies to 244 installed development package/version pairs, added local and registry release verifiers, machine evidence, QA commands, supply-chain/threat/risk reviews, and the release-audit document.
- Verification: `pnpm qa:release` passed 9 tarballs, 274/274 integrity-bearing registry lock entries, 7 production and 244 installed development licenses, 208 published maps without embedded source/absolute paths, zero install lifecycle scripts, two full-SHA workflows, bounded Dependabot ecosystems, and the fixed nine-package Changesets group. `pnpm audit --audit-level high` reported no known vulnerabilities; official npm metadata matched all seven production versions/integrities/licenses. A fresh isolated npm consumer installed all local tarballs with scripts disabled and passed init → doctor → race → report → diagnose → cleanup with unrelated state preserved. Final `pnpm check` passed 75 files/244 tests, fixtures, build, and compiled CLI smoke.
- Decisions/risks: no runtime dependency, ADR, or NOTICE change. The permissive production graph requires no project NOTICE. These are unpublished `0.0.0` local artifacts; no namespace ownership, registry package, protected OIDC attestation, tag/version match, or post-publish install is claimed. Those remain `QA-09`/M11 blockers. No credential, provider, paid Agent, publish, signing, tag, commit, push, telemetry, or global Pi mutation occurred.
- Remaining work: `DOC-01` validates a fresh user's installation/quickstart; actual versioning and protected publication remain later explicitly authorized tasks.
- Next recommended task: `DOC-01`.

## 2026-07-23 — DOC-01 Installation and five-minute quickstart

- Status: DONE
- Goal: let a fresh tester install the supported unpublished source form and reach a valid report without maintainer help or provider credentials.
- Changes: added `INSTALLATION.md` with prerequisites, source installation, a provider-free quickstart, local-sensitive report handling, exact cleanup, real-repository setup, packed maintainer checks, troubleshooting, and pre-publication limitations. Added a quickstart mode that preserves a copied report after exact run cleanup, plus a fresh-copy verifier and development commands.
- Verification: the verifier copied the repository without `.git`, dependencies, build output, or artifacts; `corepack pnpm install --frozen-lockfile --ignore-scripts` took 1.343 seconds; the documented quickstart reached a valid report with two passing trials in 5.699 seconds; total time was 7.244 seconds. It recorded no provider or credential access and preserved unrelated state. Final `pnpm check` passed 75 files/244 tests, fixtures, build, and normal compiled CLI smoke; `pnpm release:pack` audited all nine packages.
- Decisions/risks: no architecture, runtime dependency, or published-package behavior changed, so no ADR or Changeset was needed. The timing is one reference-machine measurement, not a universal promise. The report is local-sensitive, live Agent setup remains explicitly separate, and actual published installation remains an M11 gate under `R-014`. No provider, credential store, Keychain, paid Agent, telemetry, publication, commit, push, or global Pi mutation occurred.
- Remaining work: concepts/methodology, security/privacy/cleanup, contributor guides, realistic examples, dogfood, private beta, blocker closure, and the M10 release-candidate review remain.
- Next recommended task: `DOC-02`.

## 2026-07-23 — DOC-02 Concepts and methodology

- Status: DONE
- Goal: explain how PatchRace compares runs, diagnoses observable differences, evaluates Pi candidates, protects holdout evidence, and bounds every claim.
- Changes: added `CONCEPTS_AND_METHODOLOGY.md` covering exact task/variant/attempt identity, model/harness/workflow axes, correctness-first gates, repeated-run statistics and evidence tiers, trace limits, the seven-category failure taxonomy, candidate objectives/decisions, validation versus one-time holdout, and supported/unsupported result language. Added a structural verifier and README link.
- Verification: `pnpm docs:methodology:verify` passed three comparison axes, all seven taxonomy categories, the claim boundary, and consistency checks against the task, diagnosis, and optimizer contracts. Final `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build, and compiled CLI smoke; `pnpm release:pack` audited all nine packages.
- Decisions/risks: no architecture, threshold, dependency, runtime, or published-package behavior changed, so no ADR or Changeset was needed. `R-008` remains open because clear caveats cannot make small or selected samples representative. No provider, credential, Keychain, paid Agent, network access, telemetry, publication, commit, push, or global Pi mutation occurred.
- Remaining work: security/privacy/cleanup, contributor guides, realistic examples, dogfood, private beta, blocker closure, and the M10 release-candidate review remain.
- Next recommended task: `DOC-03`.

## 2026-07-23 — DOC-03 Security, privacy, and cleanup

- Status: DONE
- Goal: give users one accurate operational guide for trust, local data, packages/Pi resources, public export, exact cleanup, recovery, and incident handling.
- Changes: added `SECURITY_PRIVACY_AND_CLEANUP.md` with the non-sandbox boundary, pre-run trust checklist, local-sensitive retention inventory, package/Skill/Extension risks, shareable projection and redaction limits, four exact cleanup forms, fail-safe retention, interrupted-run recovery, a seven-step incident procedure, automatic-action denials, and the explicit absence of a real pre-publication private reporting endpoint. Added a verifier and README link.
- Verification: `pnpm docs:security:verify` passed the trust boundary, four cleanup commands, incident procedure, automatic-action denials, reporting limitation, and consistency checks against the security review, privacy review, threat model, and CLI contract. Final `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build, and compiled CLI smoke; `pnpm release:pack` audited all nine packages.
- Decisions/risks: no runtime, architecture, dependency, or package behavior changed, so no ADR or Changeset was needed. `R-002`, `R-003`, and `R-011` remain open for same-user host races, unknown disclosures, and trusted/upstream execution. A real private reporting channel remains an explicit `LCH-04` launch blocker. No provider, credential, Keychain, paid Agent, telemetry, publication, cleanup deletion, commit, push, or global Pi mutation occurred.
- Remaining work: contributor guides, realistic examples, dogfood, private beta, blocker closure, and the M10 release-candidate review remain.
- Next recommended task: `DOC-04`.

## 2026-07-23 — DOC-04 Adapter and grader contributor guides

- Status: DONE
- Goal: let an external source contributor add a fixture-backed Agent adapter or deterministic grader through reviewed public contracts without guessing lifecycle, evidence, safety, or package boundaries.
- Changes: added separate adapter and grader guides. They document public interfaces, the closed v0.1 runtime-plugin boundary, package integration points, probe/prepare/raw-first/normalization/cancellation rules, task command/assertion composition, hidden-verifier lifecycle, required positive/negative fixtures, dependency/ADR/Changeset triggers, and narrow/full verification. Linked both from README and CONTRIBUTING.
- Verification: `pnpm docs:contributors:verify` passed seven public contract exports, five maintained fixture-backed suites, required lifecycle/hidden-integrity/unrelated-state language, and explicit runtime-plugin unavailability. Final `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build, and compiled CLI smoke; `pnpm release:pack` audited all nine packages.
- Decisions/risks: no public contract, runtime, dependency, or package behavior changed, so no ADR or Changeset was needed. `R-001` and `R-006` remain open for future vendor drift and lack of enforced host isolation. No provider, credential, Keychain, paid Agent, network access, telemetry, publication, commit, push, or global Pi mutation occurred.
- Remaining work: realistic examples, dogfood, private beta, blocker closure, and the M10 release-candidate review remain.
- Next recommended task: `DOC-05`.

## 2026-07-23 — DOC-05 Realistic deterministic examples

- Status: DONE
- Goal: provide reproducible TypeScript, Python, and a third ecosystem comparison, with at least one complete protected teaching/holdout case.
- Changes: added realistic public baselines, tests, reviewed fixture fixes, and per-example guidance for TypeScript HTTP `Retry-After`, Python exact invoice aggregation, and POSIX-shell TSV failure selection. Added `REALISTIC_EXAMPLES.md`, `pnpm examples:verify`, a checked deterministic summary, retained local JSON/HTML reports, and integration with the existing 12-task Pi guidance teaching case.
- Verification: two independent `pnpm examples:verify` executions each built PatchRace, created three temporary Git repositories, ran six trials, observed each no-change variant fail and each reviewed fix pass, ranked every passing variant first by hard gates, previewed/confirmed exact run cleanup, preserved primary/unrelated state, and matched the checked summary. The teaching case recorded 8 training, 2 validation, and 2 undisclosed final-holdout tasks; one mutation was validation-eligible, passed the one-time holdout, and set `retuneAllowed: false`. Final `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build, and compiled CLI smoke; `pnpm release:pack` audited all nine packages.
- Decisions/risks: these are deterministic public fixture/harness comparisons, not live model benchmarks or leakage-resistant hidden evaluations. `R-005` remains open for representative teachers/tasks. No dependency, public package behavior, or architecture changed, so no ADR or Changeset was needed. No provider, credential, Keychain, paid Agent, network access, telemetry, publication, commit, push, or global Pi mutation occurred.
- Remaining work: at least 50 dogfood runs, private beta, blocker closure, and the M10 release-candidate review remain.
- Next recommended task: `BETA-01`.

## 2026-07-23 — BETA-01 Deterministic local dogfood

- Status: DONE
- Goal: complete at least 50 inspectable end-to-end runs across ten tasks, all three launch adapters, failure/interruption/cleanup paths, and teaching decisions with reliability and issue records.
- Changes: added `pnpm beta:dogfood`, a compiled CLI dogfood runner, 55 retained local report snapshots, per-run classifications/hashes, ten maintained chaos classes, five generated/validated candidates, a protected holdout replay, an empty final issue log, `BETA_DOGFOOD.md`, and a verifier that rehashes every report.
- Verification: final dogfood recorded 55 started and readable runs: 50 passed end to end and 5 expected valid Agent failures over 10 task IDs; passing distribution was Pi 17, Claude Code 17, Codex 16. All 55 cleanup previews/confirmations removed one owned run, preserved primary/unrelated state, and left zero orphaned PatchRace worktrees. Ten interruption/crash/recovery/cleanup classes passed. Five teaching cycles produced 2 `promote-eligible` and 3 `reject`; the 8/2/2 protected case hid holdout IDs, passed once, and disabled retuning. `pnpm beta:dogfood:verify` checked all 55 report hashes. Final `pnpm check` passed 75 files/244 tests and the CLI smoke; `pnpm release:pack` audited nine packages.
- Decisions/risks: BETA-01 closes the deterministic product-mechanics dogfood gate. It does not claim live Agent quality, current vendor authentication, or provider cost; `R-005` and `R-007` remain open for representative external evidence. No provider, credential, Keychain, network, paid Agent, telemetry, publication, commit, push, or global Pi mutation occurred.
- Remaining work: five independent target users must complete BETA-02 before blocker closure and the M10 release-candidate review.
- Next recommended task: `BETA-02`.

## 2026-07-23 — BETA-02 Private beta preparation

- Status: BLOCKED
- Goal: collect activation, failure, understanding, feedback, and repeat-use evidence from at least five target users who did not author the implementation.
- Changes: added the private-beta protocol, no-intervention participant guide, privacy-minimized participant JSON Schema, explicitly non-counting template, ignored local collection initializer, structural protocol verifier, and participant validator/aggregator. The validator rejects samples/authors/duplicates, unsafe contact/path/credential data, missing consent, unsupported environments, unclassified failures, and missing evidence; it calculates exact beta gates, activation median/p90, and open P0/P1 IDs.
- Verification: `pnpm beta:prepare` returned `READY` and created zero synthetic participants; `pnpm beta:protocol:verify` passed the five-user independence, privacy, consent, no-intervention, metric, and template boundaries. `pnpm beta:verify:selftest` accepted five isolated temporary eligible records, computed all seven gates plus the expected median/p90, and rejected fewer-than-five, sample, implementation-author, duplicate-ID, and sensitive-contact-data cases; it removed every temporary root and did not modify the real collection. `pnpm beta:verify` intentionally exited 1 with `BLOCKED`, 0 independent participants, 5 missing, and null activation statistics. Final `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/244 tests, fixtures, build, and compiled CLI smoke.
- Decisions/risks: added `R-017` for unavailable/biased independent-user evidence. No synthetic persona, maintainer, or coding agent may substitute for a target user. No PII, participant artifact, provider, credential, Keychain, network, paid Agent, telemetry, publication, commit, push, or global Pi mutation occurred.
- Exact blocker: five real eligible participants must be recruited and observed; no external participant or record was provided in this workspace.
- Attempts: completed all in-repository preparation and ran both the passing protocol verifier and the deliberately failing empty-sample gate.
- Unblock condition: add five consented pseudonymous non-author records under `.artifacts/private-beta/participants/` and make `pnpm beta:verify` reach `COLLECTED`; then triage its issue list in `BETA-03`.
- Safe work that can continue: participant recruitment/session scheduling and private source-copy distribution outside the repository. `BETA-03` and `QA-09` cannot start before the dependency is satisfied.
- Next recommended task: resume `BETA-02` after five participants are available.
## 2026-07-23 — ADR-022 Source-only preview decision and QA-09 start

- Status: PARTIAL
- Goal: replace the blocked pre-publication beta dependency with an explicit, narrowly scoped source-only GitHub preview decision and begin the M10 release-candidate review.
- Changes: accepted `ADR-022`; retained the factual 0/5 beta result; marked `BETA-02` and `BETA-03` `DROPPED` rather than passed; changed `QA-09` to require product, correctness, safety, documentation, dogfood, package-content, and preview-claim verification; and marked `QA-09` `DOING`.
- Verification: control records cross-reference the same `v0.1.0-rc.1`, source-only, not-beta-validated scope. Full release-candidate verification is still pending.
- Decisions/risks: `R-017` is accepted only for this GitHub preview and remains a stable/npm blocker. No correctness, data-loss, privacy, security, grading, holdout, automatic-activation, documentation, or package-content gate is waived.
- Remaining work: version and verify the release candidate, complete `QA-09`, prepare public repository operations and release notes, publish, and verify the GitHub preview.
- Next recommended task: complete `QA-09`.

## 2026-07-23 — QA-09 M10 source-only release-candidate review

- Status: DONE; M10 resolved with 15 `DONE` and 2 `DROPPED` tasks under `ADR-022`.
- Goal: produce and verify a versioned source-only GitHub release candidate without misrepresenting the missing independent-user beta.
- Changes: entered Changesets prerelease mode and aligned all nine public packages at `0.1.0-rc.1`; fixed the CLI and durable run controller to read release provenance from the package manifest instead of `0.0.0`; added a regression test, public-preview README, source install language, release notes/changelog, security policy, Contributor Covenant 2.1, safe issue templates, M10 review, and a release-candidate verifier.
- Verification: `pnpm check` passed formatting, ESLint, strict TypeScript, 75 files/245 tests, fixtures, build/schema generation, and the compiled CLI flow with version `0.1.0-rc.1`. `pnpm qa:rc` checked 110 Markdown files with zero broken local links, aligned/dry-packed nine packages, 274 locked integrity entries, seven production and 244 development-package licenses, source-map/package allowlists, and `published: false`. A fresh source copy installed in 684 ms and completed the valid two-trial quickstart in 5.705 seconds (6.548 seconds total). Methodology, security, contributor, three realistic-example, and 55-run dogfood verifiers passed.
- Decisions/risks: independent beta remains exactly 0/5 and is waived only for the source-only prerelease. No npm package, provider call, credential, telemetry, or global Pi mutation occurred. Hosted CI and GitHub settings remain publication gates.
- Remaining work: reserve the GitHub repository, push exact source/tag, enable private vulnerability reporting and protections, create the prerelease, and verify hosted checks and public URLs.
- Next recommended task: `LCH-01`.

## 2026-07-23 — LCH-01 Public namespace reservation

- Status: DONE
- Goal: reconfirm the public names and reserve the exact GitHub repository required for the source-only preview.
- Changes: installed the official GitHub CLI, authenticated owner `songjinmiao` through GitHub's device flow using the system keyring and a user-owned config directory, added public repository/homepage/issue metadata to the workspace and nine package manifests, and created <https://github.com/songjinmiao/PatchRace>.
- Verification: the GitHub public search returned zero `patchrace in:name` results before creation; authenticated `gh repo view songjinmiao/PatchRace` returned not found before creation; the create operation returned the public URL. npm registry checks returned 404 for `patchrace`, `pi-patchrace`, and `@patchrace/contracts`.
- Decisions/risks: only the GitHub repository is reserved. npm namespaces, domains, and social handles remain unreserved; no npm package, domain, or social account was purchased or published. The GitHub OAuth token is stored in the macOS keyring and was never printed.
- Remaining work: commit/push exact source, configure repository security/operations, create the prerelease, and verify hosted checks and public URLs.
- Next recommended task: `LCH-14`.
