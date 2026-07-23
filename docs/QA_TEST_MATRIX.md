# Automated Test Pyramid and Release-Facing Coverage

Status: `QA-01` acceptance record  
Last updated: 2026-07-23

## Decision

PatchRace uses named behavioral evidence rather than a global percentage as the
release gate. Coverage percentages remain diagnostic: they can expose an
untested seam, but they cannot prove safety, correctness, or end-to-end
usability on their own.

`pnpm check` is the mandatory local completion gate. It runs formatting, lint,
strict TypeScript, the complete Vitest suite, seven repository fixtures, four
intentional quality-failure fixtures, build/schema generation, and a built CLI
smoke test.

## Pyramid

| Layer | Primary evidence | Release-relevant behaviors |
|---|---|---|
| Unit | Co-located `*.test.ts` in all nine packages | Canonical identities, schema validation, budgets, redaction, ranking, diagnosis rules, mutation routing, candidate generation, report escaping, argument parsing, and exact state transitions. |
| Contract | Adapter, task, trace, report-format, teaching-protocol, Pi bridge, and CLI machine-output tests | Three official structured adapter surfaces; explicit unavailable values; malformed output; stable JSON; deterministic task/grader contracts; Pi-to-CLI argv boundary. |
| Integration | Git/process/worktree/artifact/recovery/hidden-verifier/comparison/candidate-service tests | Exact worktrees, process groups, cancellation, immutable artifacts, hidden verifier isolation, full race/grading/report composition, previewed promotion, exact rollback, and unrelated-state preservation. |
| Deterministic E2E | M3 E2E, M5 reference replay, comparison CLI service, `pnpm qa:smoke`, M8 demo, M9 workflow, and Pi package compatibility | prepare → execute → interrupt/resume → grade → report; installed command surface; race → diagnose; held-out teach decision; race → coach → review → promote → rollback; offline Pi install/filter/reload/update/remove. |
| Fixtures | Seven base repositories, ten-task M5 reference suite, three-Agent captured M6 demo, 21 labeled diagnosis cases, and twelve-task M8 held-out demo | TypeScript/Python success/failure, dirty state, hidden tests, timeout, conflicting patches, three ecosystems, three adapter protocols, taxonomy precision, and holdout isolation. |
| Snapshot/reproducibility | Canonical JSON/hashes plus byte-checked M6 and M8 artifacts | Stable schemas and reports without snapshotting uncontrolled time, IDs, versions, paths, or vendor output. |

## Invariant-to-evidence map

| Invariant | Automated evidence |
|---|---|
| Deterministic gates precede optional judgment | grader, ranking, regression, comparison-service, and M6 verifier tests |
| Exact task/base/config/adapter/version provenance | race plan, comparison-service, artifact, adapter, M3/M6 verifier tests |
| Raw evidence is durable before normalized views | artifact, adapter raw-first, recovery, comparison-service tests |
| Missing vendor data remains unavailable | adapter, feature, timeline, report, and M4/M6 verifier tests |
| Model/harness/workflow remain independent | race plan, ablation, comparison report, and M6 tests |
| No silent paid retry | budget, race-plan attempt identity, recovery, and successive-halving tests |
| Hidden verifier and holdout isolation | hidden-verifier, integrity, split, teaching-protocol, M5 and M8 gates |
| Human stderr / machine JSON stdout | CLI, terminal, comparison-service, Pi bridge, and `qa:smoke` |
| Injected nondeterminism | canonicalization, artifact, scheduler, teaching, demo, and report tests |
| Worktree/cleanup/promotion preserve unrelated state | core service, worktree, cleanup, process, hidden-verifier, promotion, candidate-service, and smoke tests |

## End-to-end proof boundary

`pnpm qa:smoke` launches the compiled `packages/cli/dist/main.js` as a real
child process in a new Git repository. It runs:

```text
init → doctor → two-variant race → JUnit report
→ evidence-only diagnosis → human-output check
→ cleanup preview → confirmed exact cleanup
```

The fixture uses a deterministic executable implementing the observable Pi JSON
surface. Both trials must pass their external verifier and file assertion. The
test also proves one JSON value on stdout, human output on stderr, no primary
worktree mutation, no leaked worktree, and preservation of an unrelated file.

This complements rather than replaces:

- `pnpm m8:verify`, which proves a frozen 8/2/2 train/validation/final-holdout
  teaching case without leakage or retuning;
- `pnpm m9:verify`, which proves the Pi session workflow and real offline Pi
  0.81.1 package lifecycle;
- `pnpm release:pack`, which audits all nine publishable tarballs.

## Diagnostic coverage

The pre-hardening baseline was 85.76% statements, 75.52% branches, 83.44%
functions, and 84.30% lines across production sources. The audit used the
report to find public seams rather than to set a vanity threshold:

- `CoreCommandService` had no direct routing test for `doctor`/`clean`; it now
  has success, dry-run, exact-confirmation, invalid-input, and unrelated-state
  coverage.
- the real Pi child-process bridge had only an injected-launcher contract test;
  it now executes a real child with a shell-injection-shaped argument and proves
  argv preservation.
- run discovery silently discarded corrupt owned runs; it now fails visibly and
  has a regression test.
- cleanup without a run/cache target reached a legacy placeholder; it now fails
  with an actionable usage error before touching state.

After the targeted regressions, the same report records 86.44% statements,
76.10% branches, 83.92% functions, and 85.10% lines across production sources.
The public core command routing moved from 5% to 80.64% statements and the real
Pi process bridge from 37.73% to 79.24%; those improvements reflect named
behavioral tests rather than a raised global threshold.

## Explicitly unproven here

`QA-01` does not claim the following later M10 gates:

- clean install and core flows on every macOS/Linux, Node 22/24 target
  (`QA-02`);
- the full crash/disk-pressure/stale-lock chaos matrix (`QA-03`);
- live minimum/current Pi, Claude Code, and Codex compatibility (`QA-04`);
- 50 MB report performance and memory budgets (`QA-05`);
- final malicious-input, privacy/export, dependency, and release audits
  (`QA-06..QA-08`);
- 50 dogfood runs or five independent beta users (`BETA-01..03`).

The packed clean-consumer smoke also requires an explicit registry-network
authorization because public dependencies must be resolved. An offline attempt
correctly stopped when pnpm metadata for `commander` was unavailable; no
network workaround was used. Until `QA-02` or `LCH-06` completes that test,
successful tarball inspection is not described as a clean consumer install.
