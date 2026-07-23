# AGENTS.md

This file is the operating contract for coding agents working in this repository. It applies to the entire repository unless a more specific nested `AGENTS.md` is added later.

## Project intent

PatchRace is a local-first, open-source system that races Pi, Claude Code, and Codex on reproducible repository tasks, diagnoses observable reasons for differences, proposes project-local Pi workflow improvements, and validates candidates before explicit promotion.

Preserve the product boundary:

- Pi-native, not Pi-only.
- Deterministic correctness before subjective judgment.
- Observable traces and evidence, never hidden chain-of-thought reconstruction.
- Local-first operation with no automatic telemetry or artifact upload.
- Reviewable project-local Pi candidates; never silently mutate global Pi state.
- Evaluation and improvement, not a general multi-agent collaboration framework.

## Read before changing anything

For non-trivial work, read the smallest relevant set in this order:

1. `docs/PROGRESS.md` for the current milestone, active task, and immediate queue.
2. The task row in `docs/TASKS.md`, including dependencies and acceptance criteria.
3. `docs/DECISIONS.md` for accepted constraints; never overwrite accepted history.
4. `docs/MAINTENANCE.md` for task-state and project-record rules.
5. The relevant contract or architecture document under `docs/architecture/`.
6. `docs/RISKS.md` and `docs/THREAT_MODEL.md` for security-, privacy-, cleanup-, auth-, or execution-sensitive work.

Canonical sources of truth are listed in `docs/MAINTENANCE.md`. If documents disagree, do not silently choose one: identify the conflict and update all affected records in the same task.

## Task discipline

- Work on one canonical `DOING` task at a time unless parallel work is explicitly planned.
- Before starting tracked implementation, verify every dependency is `DONE`, mark the selected task `DOING`, and update `docs/PROGRESS.md` with its acceptance checks.
- Do not expand v0.1 scope merely because an adjacent feature is attractive. A material product or architecture change requires an ADR and a task-ledger update.
- Keep changes bounded to the requested task. Preserve unrelated and user-authored changes in a dirty worktree.
- A task is not `DONE` until its deliverable, acceptance criteria, verification, and control-document updates are complete.
- On completion, update `docs/TASKS.md`, `docs/PROGRESS.md`, and `docs/SESSION_LOG.md` together, following `docs/MAINTENANCE.md`.
- Do not create commits, tags, releases, publish packages, or push branches unless the user explicitly asks.

Small typo-only or explanatory documentation edits need not claim a milestone task, but they must not change product scope, architecture, contracts, or task status implicitly.

## Architecture boundaries

Follow the dependency direction documented in `docs/DEVELOPMENT.md` and enforced by TypeScript project references:

```text
contracts
├─ core ─┬─ adapters
│        ├─ tasks
│        ├─ cli
│        └─ pi-extension
├─ diagnosis ─ optimizer
└─ report
```

- Put public wire formats and shared schemas in `@patchrace/contracts`.
- Keep orchestration and durable execution behavior in `@patchrace/core`.
- Keep vendor-specific invocation and parsing in `@patchrace/adapters`.
- Keep argument parsing, presentation routing, and exit-code mapping in the CLI; do not move business state into the CLI shell.
- Presenters consume durable artifacts and must never become the source of truth.
- Do not introduce reverse package dependencies, cross-package source imports, or duplicate contract types.
- Do not edit generated `dist/`, `*.tsbuildinfo`, or generated schemas by hand. Change source and regenerate with repository scripts.
- Prefer Node standard-library primitives and existing utilities. A new runtime dependency requires the review described in `docs/architecture/STACK_AND_DEPENDENCIES.md` and must use an exact version.

## Core correctness invariants

Do not weaken these without a superseding ADR:

1. Hard deterministic gates run before optional LLM judgment; a judge cannot rescue failed tests.
2. Every trial records exact task, base commit, configuration, adapter, and version provenance.
3. Completed raw evidence is append-only. Mutable coordinator state is never the only evidence.
4. Missing vendor events, token counts, costs, or capabilities are represented as unavailable, never inferred or replaced with zero.
5. Model, harness, and Pi-resource changes remain independent variant dimensions.
6. Retries of paid Agent work are explicit attempts with lineage; never retry silently.
7. Hidden verifier material remains unavailable to the Agent until grading.
8. Final holdout tasks and reference patches are unavailable to diagnosis, candidate generation, and optimization.
9. Human-readable output goes to stderr. Requested machine output is stable, documented JSON on stdout.
10. Time, IDs, versions, and paths are injected in tests; do not snapshot uncontrolled nondeterminism.

## Adapter rules

- Use official structured surfaces and normal local authentication flows: Pi CLI/SDK, Claude Code print stream JSON, and Codex exec JSONL, as recorded in `ADR-017`.
- Probe executable health, supported version, capabilities, and auth readiness. PATH presence alone is not readiness.
- Never enumerate, extract, copy, log, or persist vendor credentials. Record only normalized readiness such as `ready`, `missing`, `expired`, or `unknown`.
- Preserve raw vendor bytes before normalization. Malformed output remains inspectable and produces an explicit parser error; never fabricate normalized events.
- Map only observable messages, tool calls, file operations, commands, tests, timing, usage, and results. Do not request or infer private reasoning.
- Build adapters on the shared M3 process, budget, cancellation, recovery, artifact, and redaction contracts. Do not add adapter-specific lifecycle shortcuts.
- Cancellation and timeout may signal only the recorded process group and must retain partial evidence.
- Maintain fixture-based adapter contract tests for invocation, streaming, malformed output, cancellation, timeout, unavailable auth, and version reporting.

## Safety, privacy, and destructive operations

- Git worktrees isolate repository state; they are not a filesystem, process, credential, or network sandbox. Never claim otherwise in code or documentation.
- Cleanup is allowed only for canonical, recorded descendants of a PatchRace-owned run root. Resolve and validate exact targets, support dry-run, and fail closed on ambiguity.
- Never delete existing branches, user worktrees, unrelated files, raw evidence, or user configuration as an implementation convenience.
- Repository setup and verifier commands are executable user input. Avoid shell-string interpolation; prefer explicit executable/argument arrays and constructed environment allowlists.
- Never commit credentials, raw Agent traces, `.patchrace/runs`, local artifacts, private code, or absolute personal paths.
- Redaction produces a safer export copy; it does not make raw artifacts safe or guarantee removal of unknown secrets.
- Report publication, telemetry, network upload, and external disclosure are opt-in only.
- Do not run paid model calls, credentialed end-to-end tests, or commands that expose repository content to a provider unless the user explicitly authorizes that exact test and its budget.
- For authorized local E2E, follow the credential retrieval rules in `docs/MAINTENANCE.md`; never print a secret or pass it in argv/config.
- Generated Markdown, prompts, settings, and Skills are untrusted proposals until reviewed. v0.1 must not auto-generate or activate executable Pi extensions.

## Code and test conventions

- Runtime target: strict ESM TypeScript 6 on Node 22 and 24 LTS; package manager: the pinned pnpm version.
- Follow existing style and compiler settings. Avoid `any`, unchecked casts, hidden global state, and catch blocks that discard causal errors.
- Prefer small typed functions, explicit state transitions, dependency injection at process/filesystem/time boundaries, and actionable error messages.
- Unit tests live beside source as `*.test.ts`. Cross-package or lifecycle behavior belongs in deterministic fixtures or integration tests.
- Every bug fix gets a regression test that fails for the original behavior.
- Tests involving Git, processes, cancellation, cleanup, artifacts, adapters, or redaction must assert both the intended result and preservation of unrelated state.
- Do not weaken, skip, delete, or broadly rewrite tests to make a change pass. If an acceptance check is invalid, explain and update the contract or ADR first.

Use the narrowest useful checks while iterating, then run the applicable completion gates:

```bash
pnpm test -- <relevant-test>
pnpm typecheck
pnpm check
```

- `pnpm check` is required before completing an implementation task unless a documented environment blocker prevents it.
- Run `pnpm release:pack` for changes affecting published package contents or package metadata.
- Run supply-chain checks when changing dependencies; network-dependent checks may be reported separately when offline.
- Add a Changeset for user-visible behavior in a publishable package. Do not add one for repository-only documentation or test changes.

## Documentation and public claims

- Update documentation in the same change when behavior, schema, CLI output, safety guarantees, compatibility, or user workflow changes.
- Use evidence-backed language. Distinguish model comparisons, harness comparisons, and Pi workflow ablations.
- Do not claim universal Agent superiority from one run, a small sample, or reused holdout data.
- Label experimental adapters, unavailable metrics, optional judges, security limitations, and platform limitations explicitly.
- Keep examples deterministic, copyable, and free of real credentials, usernames, home paths, and private repository data.

## Definition of done and handoff

Before reporting completion:

1. Re-read the task acceptance criteria and relevant invariants.
2. Inspect the final diff for unrelated edits, generated-file mistakes, secrets, and personal paths.
3. Run the narrow tests plus the required completion gates.
4. Update task, progress, decision, risk, and session records when applicable.
5. Report outcome first, changed files, exact verification and results, residual limitations or risks, task status, and the next dependency-ready task ID.

If blocked, record the exact blocker, attempts, unblock condition, and safe work that can continue. Do not bypass a safety, auth, dependency, or acceptance gate to manufacture completion.
