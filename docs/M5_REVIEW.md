# M5 Tasks and Grading Review

Status: passed 13/13 tasks on 2026-07-22

## Decision

`M5 — Tasks and grading` passes. PatchRace now has immutable task identities,
reviewed manual/history-backed suite construction, deterministic command and
repository gates, grader-only hidden verifier injection, validity/flakiness
replay, protected train/validation/holdout access, evidence-safe integrity
findings, and conservative repeated-run statistics. The ten-task reference
inventory replayed reproducibly without an Agent, network, or credential.
`M6` may start with `CMP-01`.

This decision does not claim that a Git worktree hides files from a hostile host
process. On the current non-sandbox fixture host, hidden-verifier integrity is
correctly `unknown`; only an execution backend with an actually enforced
filesystem boundary may supply `enforced-filesystem` and obtain `valid`.

## Task evidence

| Tasks | Result | Evidence |
|---|---|---|
| `EVAL-01..02` | PASS | Public `TaskV1` types/schema freeze baseline, instructions, setup/verifier assets and commands, assertions, budgets, provenance, and metadata. Strict JSON/YAML loading revalidates canonical descendant files and hashes. Manual init uses exact HEAD, creates review-required editable files without an Agent, refuses conflicts, and preserves forced replacements in recoverable backups. |
| `EVAL-03..04` | PASS | Setup/verifier commands use the shared process-group lifecycle, constructed environments, canonical cwd/evidence paths, bounded output/time, and create-only evidence. Git-backed assertions enforce required/forbidden/protected/content/diff/dependency/lockfile/cleanliness/command rules against the immutable baseline with repository-relative evidence. |
| `EVAL-05` | PASS | Hidden assets require an external verifier vault. After a confirmed stopped Agent process, tracked and regular-untracked changes are hashed and reproduced in a detached grader worktree; assets are hash-revalidated and injected create-new, collisions and symlink/path escapes fail, successful grading cleans exactly the grader worktree, and integrity failures retain evidence. |
| `EVAL-06..07` | PASS | Local Git mining reconstructs linear parents, separates implementation/test/reference patches, records privacy-safe provenance and explicit exclusions, and always requires review. Optional GitHub enrichment uses user-controlled official `gh` readiness, bounded normalized/cache evidence, and never becomes a local-mining dependency or records auth material. |
| `EVAL-08` | PASS | `category-hash-v1` deterministically commits seed, task set, assignments, category counts, and holdout membership. Candidate-generation views omit holdout IDs; phase checks reject cross-split use; final opening requires a separately hashed gate record. |
| `EVAL-09` | PASS | At least two fresh baseline/reference replays separate already-solved, impossible, setup/environment, patch, task-drift, infrastructure, and nondeterministic failures. Reports retain stable attempt evidence and clean only their exact worktrees. |
| `EVAL-10` | PASS | Pre-grade integrity rechecks task/config hashes, baseline ownership/HEAD, every referenced asset, split authorization, ignored/protected paths, hidden mount collisions, Agent-visible roots/prompts, and bounded changed-file content. Findings omit hidden bytes and vault paths. Violations are `compromised`; inspection/host-isolation gaps are `unknown`. |
| `EVAL-11` | PASS | Exact task/variant observations report eligible and excluded counts, success rate, finite-sample `pass@k`, independence-labeled plug-in `pass^k`, sample variance/error, Wilson 95% intervals, sorted failure categories and hashes, plus mandatory small-sample/dependence/unavailable caveats. |
| `EVAL-12` | PASS | The versioned inventory contains ten JavaScript, Python, and repository-configuration recipes across five categories, including three external hidden verifiers and one deterministic flake. Fresh replay yields nine eligible tasks, one flaky task, one eligible review-required mined candidate, complete split assignment, honest host-integrity limitation, stable statistics, unrelated-state preservation, and zero leftover owned trial worktrees. |
| `EVAL-13` | PASS | Full quality, reference replay, structural review, package-content, architecture, risk, threat-model, and task-ledger gates pass. No generated source artifact, credential, raw Agent trace, paid call, network upload, or global Pi mutation was introduced. |

## Correctness and leakage review

- Deterministic commands/assertions run before any future optional judge; no
  scoring or statistical layer can rescue a hard gate.
- Task, reference patch, split, integrity, validity, statistics, and result
  evidence use content hashes. Missing vendor metrics are outside this layer and
  remain unavailable rather than zero.
- Full split membership stays coordinator-protected; optimizer-facing JSON has
  only training/validation IDs plus a holdout count and commitment. Final access
  is separately gated and auditable.
- Hidden sources remain outside task bundles, repositories, worktrees, prompts,
  declared visible roots, caches, and result evidence. Changed and ignored paths
  are scanned for protected mounts and exact hidden path/hash/content disclosure.
- Detection is not confinement. Unknown encodings or an unconstrained host
  process may evade scanning, so host-only runs cannot claim leakage-resistant
  validity. This residual limitation is explicit in result, fixture, architecture,
  risk, and threat-model documentation.

## Reference replay

```text
pnpm m5:reference
```

The isolated gate reconstructs every baseline and reference commit in temporary
Git repositories. It passed one aggregate test covering ten tasks: 9 eligible,
1 reproducibly flaky, 3 ecosystems, 5 categories, 3 external hidden verifiers,
10/10 split assignments, mining/manual-init paths, statistics, integrity, exact
cleanup, and unrelated-state preservation.

## Verification

```text
pnpm check
pnpm m5:verify
pnpm release:pack
```

The final quality gate passed 27 test files/85 tests, seven repository fixtures,
four intentional quality failures, strict TypeScript/ESLint/Prettier, and schema
generation. The M5 verifier reran the ten-task reference suite and checked all
13 ledger rows, required source/test/contract/review artifacts, inventory
coverage, package script, architecture claims, progress closure, and Changeset.
All nine publishable package dry runs passed.

No paid or credentialed model call was needed or authorized. Python is used only
as an existing fixture ecosystem, not added as a product runtime dependency.

## M6 entrance decision

`CMP-01` is dependency-ready. Race orchestration must compose these immutable
task, validity, integrity, grading, split, and statistics contracts; it may not
convert `unknown` integrity or `not_graded` infrastructure evidence into a pass.
