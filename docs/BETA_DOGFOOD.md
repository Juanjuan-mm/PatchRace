# BETA-01 Dogfood Record

Status: deterministic local gate passed  
Executed: 2026-07-23  
Machine evidence: `.artifacts/dogfood/summary.json` (local-sensitive, ignored)

## Scope and decision

The BETA-01 product-mechanics gate passes. PatchRace completed 55 real compiled
CLI races, including 50 passing end-to-end runs and five deliberately failing
Agent outcomes. The same run executed the maintained chaos suite and five
candidate generation/validation cycles. Every race generated a readable report,
used previewed/confirmed exact cleanup, and preserved the primary repository and
unrelated sentinel.

This is deterministic local dogfood. The Pi, Claude Code, and Codex adapter
implementations processed their real structured protocol shapes through local
fixture executables. No vendor model, account, credential, network endpoint, or
paid budget was used. This evidence supports lifecycle/reliability mechanics,
not live model quality, current vendor auth, provider cost, or general Agent
performance.

## Run inventory

| Metric | Required | Observed |
|---|---:|---:|
| Passing end-to-end runs | ≥ 50 | 50 |
| Started runs with readable terminal/recoverable evidence | ≥ 98% | 55/55 (100%) |
| Distinct tasks | ≥ 10 | 10 |
| Pi adapter passing runs | exercised | 17 |
| Claude Code adapter passing runs | exercised | 17 |
| Codex adapter passing runs | exercised | 16 |
| Deliberate failed outcomes | coverage | 5 |
| Cancellation/crash/resume/cleanup scenarios | ≥ 10 | 10 maintained chaos classes plus 55 exact cleanup cycles |
| Candidate generation/validation cycles | ≥ 5 | 5 |
| Rejected candidates | ≥ 3 | 3 |
| Orphaned PatchRace worktrees | 0 | 0 |
| Unrelated-state damage | 0 | 0 |

The ten task IDs are `dogfood-01` through `dogfood-10`. They rotate metadata
across TypeScript, Python, and POSIX shell and share an exact immutable baseline
commit. Each instruction names one file. The passing fixture changes that file
from `broken` to `fixed`; the public verifier and diff/protected-path assertions
must pass. The failing fixture makes no change, so the deterministic test gate
fails.

The run distribution is intentionally balanced as closely as 50 permits:
Pi 17, Claude Code 17, and Codex 16. Every adapter completed executable/version
health, auth-readiness semantics, pure preparation, structured streaming,
raw-first persistence, normalization, grading, ranking, report generation, and
cleanup through the compiled CLI. Missing real provider cost is unavailable,
never zero.

## Failure classification

| Classification | Count | Disposition |
|---|---:|---|
| Product bug | 0 | None observed in this run. |
| Environment/adapter issue | 0 | None observed in this run. |
| Invalid task | 0 | All ten tasks passed with the reviewed fixture. |
| Agent failure | 5 | Expected no-change fixture; valid hard test gate failed. |
| Expected budget stop | 0 | Covered separately by maintained chaos tests. |
| Unclassified | 0 | Gate requires every failure to be classified. |

An Agent task failure remained distinct from adapter/infrastructure failure.
The five failed reports retained valid integrity and a failed deterministic
gate; they were not counted among the 50 passing runs.

## Interruption, recovery, and cleanup

`pnpm qa:chaos` passed seven files/27 tests during dogfood. The BETA record
selects ten required operational classes:

1. dirty primary repository and conflicting worktree;
2. timed-out owned process group with unrelated process preservation;
3. Agent crash with partial stdout/stderr retention;
4. stale lease refusal without evidence replacement;
5. disk-budget pressure with admission stop;
6. partial final event recovery and finalized-hash mismatch;
7. symbolic-link-swapped cleanup target refusal;
8. explicit cancellation;
9. completed-trial non-resumption;
10. complete malformed evidence retained for inspection.

In addition, all 55 CLI runs performed a non-destructive dry run followed by
confirmed removal of exactly one owned run. The verifier observed one remaining
primary Git worktree, zero PatchRace-owned orphans, an unchanged primary index,
and an unchanged unrelated sentinel.

## Teaching cycles

Five cycles each generated one bounded project-guidance candidate from a cited
high-confidence deterministic context finding, created baseline/candidate
objective vectors over five validation task IDs, and applied one frozen
correctness-first Pareto policy:

| Cycle | Result | Reason |
|---|---|---|
| 1 | `promote-eligible` | Required success improvement with all hard gates/budgets. |
| 2 | `promote-eligible` | Required success improvement with all hard gates/budgets. |
| 3 | `reject` | Hard-gate regression. |
| 4 | `reject` | Minimum success improvement not met. |
| 5 | `reject` | Configuration-complexity regression. |

The separate maintained 12-task case also passed 8 training, 2 validation, and
2 final-holdout tasks. Proposal bytes exposed no holdout IDs; the frozen
candidate passed the one-time final gate and recorded `retuneAllowed: false`.
No candidate was activated or promoted to project/global Pi state.

## Issue log

No new product defect was observed in the successful final dogfood execution,
so `.artifacts/dogfood/issues.json` contains an empty issue list. Earlier
development-time runner mistakes (a too-small `maxTrials` configuration and
candidate complexity field/budget assumptions) were in the new audit script,
not PatchRace product failures; they were corrected before the final recorded
execution and are not counted as product reliability events.

The following are limitations, not silently closed issues:

- fixture protocols do not measure live vendor model quality or current auth;
- cost/token availability follows fixture output and does not estimate provider
  spend;
- deterministic public tasks do not establish private-repository
  representativeness;
- the five-user independent beta remains `BETA-02`.

No P0/P1 product issue was discovered by this gate. Any live provider dogfood
still requires an exact user-authorized task, model/endpoint, and budget.

## Evidence and reproduction

Run:

```bash
corepack pnpm beta:dogfood
corepack pnpm beta:dogfood:verify
```

The first command rebuilds the product, creates one temporary trusted Git
repository, performs 55 races, writes 55 local report snapshots, runs chaos and
teaching, and removes the temporary repository. The second validates the
summary, classifications, report hashes/content, issue log, and this document.

Evidence locations:

- `.artifacts/dogfood/summary.json`
- `.artifacts/dogfood/issues.json`
- `.artifacts/dogfood/reports/001.json` through `055.json`

These reports are synthetic but still local-sensitive. They are not committed
or public exports.

