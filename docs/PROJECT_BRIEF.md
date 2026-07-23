# Project Brief

Last updated: 2026-07-22

Status: accepted and frozen for v0.1 by task `F0-01`

## Product thesis

PatchRace is a local-first, open-source training ground for Pi:

1. Replay real software-engineering tasks in isolated Git worktrees.
2. Run Pi, Claude Code, and Codex under explicit, reproducible configurations.
3. Grade results with deterministic tests and repository constraints before any subjective scoring.
4. Align observable trajectories and diagnose whether Pi lost because of model capability, missing context, workflow, tools, or verification.
5. Propose reviewable project-local Pi artifacts such as `AGENTS.md`, `SKILL.md`, prompt templates, or settings changes.
6. Promote a candidate only after it improves on validation and held-out tasks without violating cost, latency, safety, or complexity budgets.

## Primary user

An advanced individual developer or small team that:

- uses Pi as a programmable coding-agent harness;
- also has access to one or more frontier coding-agent CLIs;
- maintains project-specific instructions, skills, prompts, or extensions;
- wants evidence that a workflow change helps on their own repository.

The primary launch persona is the **Pi Workflow Builder**. Skill/package authors and hands-on small-team coding-agent evaluators are secondary launch personas. Detailed entry conditions, outcomes, anxieties, and ranked jobs are frozen in [PERSONAS_AND_WORKFLOWS.md](PERSONAS_AND_WORKFLOWS.md).

## Core promise

> When Pi loses, it learns — but no change is accepted without evidence.

The tool must answer three questions:

1. What happened?
2. Why did Pi underperform?
3. Which concrete Pi change improves future performance on unseen tasks?

## v0.1 scope

### Required

- Local CLI with no hosted account requirement.
- Git worktree isolation and recoverable run artifacts.
- Pi, Claude Code, and Codex adapters using locally authenticated CLIs.
- Manual task suites and task mining from local Git history; optional GitHub metadata via `gh`.
- Deterministic command, test, file, and diff graders.
- Repeated runs, budgets, baseline comparisons, and a static HTML report.
- Normalized observable traces: file reads, searches, commands, edits, tests, failures, timing, token and cost data when available.
- Explainable Pi failure taxonomy.
- Candidate generation for project-local `AGENTS.md`, Pi skills, and prompt templates.
- Train/validation/holdout separation, ablation, candidate promotion and rollback.
- Pi extension exposing the core race/coach workflow.
- Secret redaction and explicit opt-in for any publication or trace export.

### Deferred

- Automatic TypeScript extension generation or activation.
- Cloud dashboard, accounts, billing, team RBAC, or remote workers.
- Public leaderboard.
- Multi-agent collaboration or task decomposition.
- Built-in general-purpose sandbox.
- Automatic installation of third-party Pi packages.
- Fully autonomous continuous modification of global Pi configuration.

## Product boundaries

- Only observable actions and user-owned artifacts are analyzed. Hidden chain-of-thought is neither required nor sought.
- A teacher agent's success is evidence, not ground truth. Tests and repository acceptance criteria remain the correctness gate.
- The optimizer must be allowed to conclude that a failure is a model-capability gap and should not be patched with more instructions.
- Global `~/.pi` files are never modified silently. v0.1 candidates are staged project-locally and require explicit promotion.
- Generated instructions and skills are treated as untrusted until reviewed and validated.
- PatchRace is local-first, not offline: user-installed agent CLIs may send repository context to their configured model vendors.
- Git worktrees isolate concurrent repository edits but are not a host security sandbox.
- v0.1 collects no automatic PatchRace telemetry and uploads no traces or reports without explicit user action.

## v0.1 success criteria

The complete measurement and stop policy is frozen in [SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md). Headline gates are:

- Installation to first valid local comparison in no more than 5 minutes on a prepared example.
- At least 50 successful dogfood runs before public release.
- At least 3 realistic public demo ecosystems.
- At least one documented case where a Pi candidate improves held-out task performance.
- Zero known critical data-loss, credential-leak, or unsafe-cleanup defects at release.
- Clean install and core workflow on current macOS and Linux CI runners.
- A private beta in which at least 4 of 5 target users complete the prepared example without live maintainer intervention.
- At least 80% precision for high-confidence rule-based diagnoses on a labeled pre-release set.

## Frozen product language

- Project name: PatchRace, accepted for development but not reserved; `LCH-01` must recheck and secure namespaces.
- CLI: `patchrace`.
- Pi package: `pi-patchrace`.
- Optimization command: `patchrace teach pi`.
- Pi interaction name: `/coach`, subject only to an implementation-time command collision check.
- Tagline: “Race agents. Distill what wins. Make Pi better.”

See [NAMING.md](NAMING.md) for point-in-time namespace checks and fallbacks.

## Canonical vocabulary

| Term | Meaning |
|---|---|
| Task | A frozen repository baseline, instruction, setup, verifier, constraints, budgets, and provenance. |
| Suite | A versioned collection of tasks and their category/split metadata. |
| Variant | One declared agent/model/harness/workflow configuration being evaluated. |
| Trial | One attempt by one variant on one task. |
| Run | The durable parent record coordinating one or more trials. |
| Baseline | The previously accepted variant/result used for comparison. |
| Teacher | A comparison agent whose observable success may inform diagnosis; never ground truth by itself. |
| Diagnosis | An evidence-linked explanation classified as discovery, context, workflow, tool, verification, capability, or unknown. |
| Candidate | A staged, reviewable Pi mutation with lineage and an evaluation history. |
| Holdout | Tasks isolated from candidate generation and selection until the final gate. |
| Promote | Explicitly accept and apply a validated project-local candidate. |
| Hold | Keep the baseline because evidence is insufficient or trade-offs need a user decision. |
| Reject | Discard a candidate because it fails gates or does not improve the declared objective. |

## Accepted supporting policy

- [Naming and namespace check](NAMING.md)
- [License and governance](GOVERNANCE.md)
- [Public positioning and competitor boundary](POSITIONING.md)
- [Success and stop criteria](SUCCESS_CRITERIA.md)
- [Initial threat model and privacy boundaries](THREAT_MODEL.md)
- [Personas and ranked workflows](PERSONAS_AND_WORKFLOWS.md)
