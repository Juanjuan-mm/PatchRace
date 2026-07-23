# Execution Plan

Last updated: 2026-07-22

This document describes the delivery sequence and milestone gates. The authoritative task status is maintained in [TASKS.md](TASKS.md), while the current operational snapshot is in [PROGRESS.md](PROGRESS.md).

## Delivery principles

1. Build the deterministic evaluation substrate before attempting optimization.
2. Make every run reproducible, inspectable, budgeted, and recoverable.
3. Separate model comparison, harness comparison, and Pi workflow ablation.
4. Propose small Pi mutations and validate one variable at a time.
5. Preserve a final holdout set and never optimize repeatedly against it.
6. Prefer project-local and reviewable changes; never silently mutate global Pi state.
7. Treat security, cleanup, trace privacy, and CLI compatibility as release features.

## Milestones

| Milestone | Objective | Exit gate |
|---|---|---|
| `M0` | Product foundation | Product brief, scope, naming search, license, success metrics, and initial threat/privacy boundaries are approved. |
| `M1` | Architecture and technical feasibility | Architecture RFC and all critical spikes prove Pi, Claude, Codex, worktree, artifact, adapter, grader, and optimizer contracts. |
| `M2` | Development foundation | Monorepo, CLI skeleton, fixtures, quality gates, CI, release skeleton, and contributor workflow are operational. |
| `M3` | Reproducible execution core | A task can run safely in isolated worktrees with budgets, cancellation, resume, artifacts, and redaction. |
| `M4` | Agent adapter layer | Pi, Claude Code, and Codex pass a shared adapter contract and emit normalized events and metrics. |
| `M5` | Task and grading system | Manual and mined tasks can be replayed with deterministic, leakage-resistant grading and dataset splitting. |
| `M6` | Comparison product | Users can race configurations and inspect terminal, JSON, HTML, diff, trace, cost, and stability reports. |
| `M7` | Explainable diagnosis | Pi failures are classified with evidence and the system can distinguish workflow gaps from likely capability gaps. |
| `M8` | Pi teaching loop | The system generates reviewable Pi candidates, validates them with ablation and holdout, and supports promotion/rollback. |
| `M9` | Pi-native UX | A packaged Pi extension exposes race, diagnosis, candidate review, and promotion workflows. |
| `M10` | Release hardening and beta | Cross-platform, compatibility, privacy, security, documentation, dogfood, and beta gates pass. |
| `M11` | Public GitHub launch | Repository, packages, release artifacts, demo report, launch article, and support process are public. |

## Dependency graph

```text
M0 Product foundation
  └─ M1 Architecture and spikes
      └─ M2 Development foundation
          └─ M3 Execution core
              ├─ M4 Agent adapters
              └─ M5 Tasks and grading
                  └─ M6 Comparison product
                      └─ M7 Diagnosis
                          └─ M8 Pi teaching loop
                              └─ M9 Pi-native UX
                                  └─ M10 Hardening and beta
                                      └─ M11 GitHub launch
```

`M4` and parts of `M5` may proceed in parallel after the `M3` contracts are stable, but milestone gates must still be passed in order.

## Recommended execution cadence

- Work on one canonical `DOING` task at a time unless parallel work is explicitly planned.
- Keep task size between roughly half a day and two focused engineering days.
- End every task with evidence: tests, fixture output, report, benchmark, screenshot, or approved document.
- Run a milestone review at each exit gate. Do not carry unresolved release-blocking issues into the next milestone without a recorded decision.
- Re-estimate only at milestone boundaries or after a material architecture change.

## Estimated shape, not a promise

Assuming one primary developer using coding agents heavily:

| Milestone group | Focused engineering time |
|---|---:|
| `M0–M2` | 2–3 weeks |
| `M3–M6` | 4–6 weeks |
| `M7–M9` | 4–6 weeks |
| `M10–M11` | 2–3 weeks |

The largest uncertainty is not CLI scaffolding; it is constructing trustworthy historical tasks, normalizing unstable agent outputs, and demonstrating a non-overfit Pi improvement.

## Release gates

### Correctness gate

- All required CI checks pass.
- Core fixtures are deterministic enough to diagnose failures.
- No candidate is promoted when deterministic correctness regresses.

### Safety gate

- Cleanup cannot delete existing branches, worktrees, or unrelated files.
- Dirty repositories and interrupted processes have tested recovery behavior.
- Trace publication is opt-in and redacted.
- Generated Pi artifacts require review before activation.

### Product gate

- A new user can complete the quickstart on a prepared repository.
- At least one end-to-end demo reaches `race → diagnose → propose → validate → promote`.
- Reports explain evidence, not merely a composite score.

### Launch gate

- Namespaces and package names are confirmed.
- Licenses and third-party notices are complete.
- Installation, compatibility, security, contribution, and troubleshooting documentation exist.
- Maintainer support and issue-triage process is ready for the first 72 hours.

## Scope-change rule

A proposed feature enters v0.1 only when it is required for a milestone exit gate or replaces an existing task. Otherwise it goes into the post-launch backlog. Material changes require an entry in [DECISIONS.md](DECISIONS.md) and corresponding task-ledger edits.
