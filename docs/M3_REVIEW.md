# M3 Reproducible Execution Core Review

Status: passed 12/12 tasks on 2026-07-22

## Decision

`M3 — Reproducible execution core` passes. PatchRace now has a fail-closed local execution substrate for versioned configuration, durable evidence, exact Git worktrees, bounded child processes, concurrent scheduling, interruption recovery, redacted export, environment inspection, and explicit cleanup. `M4` may start with `ADP-01`.

## Task evidence

| Tasks | Result | Evidence |
|---|---|---|
| `CORE-01..02` | PASS | YAML 1.2/JSON parse through a strict versioned Ajv schema owned and published by `@patchrace/contracts`; unknown keys and unresolved references produce stable paths; defaults canonicalize identically; SHA-256 identities, validated run/trial ULIDs, create-new finalization, append/fsync logs, mutable coordinator snapshots, hashes, and artifact indexes are tested. |
| `CORE-03..05` | PASS | The worktree manager verifies the Git top-level and full commit, serializes Git mutation, creates detached collision-free worktrees, retains dirty evidence by default, and verifies removal; the process runner uses argv without a shell, allowlisted environment names, streamed backpressure, process groups, time/output/cancel stops, and normalized spawn failures; the DAG scheduler enforces dependencies, lock keys, concurrency, and independent failure containment. |
| `CORE-06..08` | PASS | Wall/run/token/cost/disk limits retain unavailable metrics as `null`; cancellation and append-only checkpoints reconstruct pending work without reopening terminal trials; invalid partial JSONL tails are truncated and recorded; known tokens, configured literals, paths, sensitive fields, prompts, and output files redact into a separate create-new export with false-positive controls and a residual-risk manifest. |
| `CORE-09..10` | PASS | `doctor` checks supported Node, Git/worktree behavior, capacity, config, executable versions, and non-secret auth readiness with remediation; `clean` defaults to an exact dry run, validates ownership/canonical descendants, refuses broad/symlink/unrecorded targets, and requires confirmation for run worktrees, artifacts, or eligible cache entries. |
| `CORE-11` | PASS | `m3.e2e.test.ts` creates a real Git fixture, reserves a run, prepares and executes one trial, interrupts before a second, reconstructs state, resumes only pending work, rejects duplicate finalization, inspects and redacts output, then removes exactly two recorded worktrees and the owned run root. |
| `CORE-12` | PASS | Unit, integration, lint, type, M2 regression fixtures, build, release-schema generation, structural M3 verification, and package gates pass; the destructive-action, recovery, reproducibility, and artifact invariants have direct tests. |

## Safety and recovery review

- Cleanup never derives a target from a glob, unresolved value, home/root path, or unvalidated ID. Git cleanup rechecks the actual worktree path and commit immediately before removal; cache cleanup requires a matching per-entry PatchRace ownership marker during both planning and execution.
- Child termination signals only the recorded process group created by the runner. Environment values are constructed from an allowlist and are never recorded in invocation metadata.
- Recovery refuses an existing lease rather than guessing from a possibly reused PID. Sequence gaps, duplicate terminal events, and artifact hash mismatches force `needs_inspection`; only a malformed final partial line is truncated.
- Raw evidence is never redacted in place. Export is create-new, enumerates selected artifacts and findings, and states that unknown secrets may remain.

## Verification

```text
pnpm check
pnpm m3:verify
pnpm release:pack
pnpm supply-chain:licenses
pnpm audit --audit-level moderate
```

The final gate passed 14 test files/32 tests, 12/12 M3 structural checks, all nine package dry runs, seven external production-package license checks, and a moderate-threshold audit with no known vulnerabilities. No real agent credential or model invocation is required for the deterministic core fixture, and Python remains a fixture ecosystem rather than a product runtime dependency.

## M4 entrance decision

`ADP-01` is dependency-ready. Adapters must use the shared process, artifact, cancellation, budget, and redaction boundaries and may not weaken unavailable-metric or credential-readiness semantics.
