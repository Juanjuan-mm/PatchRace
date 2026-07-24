# @patchrace/tasks

Versioned task and deterministic grader foundations. `loadTask()` accepts strict
JSON or YAML `TaskV1` files, validates path-level schema and semantic references,
verifies every instruction/setup/verifier asset hash, and returns canonical JSON
plus the immutable task hash. Referenced files must remain regular descendants of
the task directory; symlink and `..` escapes fail closed.

The public wire type and generated JSON Schema are owned by
`@patchrace/contracts` as `TaskV1` and `task-v1.json`.

`runTaskCommandPhase()` executes declared setup or verifier commands through the
shared process-group runner. It constructs an allowlisted environment, enforces
cwd containment, cancellation, timeout, and output limits, then writes
create-only stdout/stderr/result evidence outside the worktree. Repository
commands are trusted host code; PatchRace worktrees are not a security sandbox.

`evaluateTaskAssertions()` derives a deterministic, no-rename Git diff against
the immutable baseline and enforces required/forbidden/protected paths, exact or
patterned file content, file/line/binary/dependency/lockfile limits, and allowed
untracked/merge-conflict cleanliness. Evidence uses repository-relative paths;
file-content symlink escapes are grader errors.

Hidden verification requires `loadTask(..., { verifierRoot })` with a verifier
vault separate from the task directory and repository. `runHiddenVerifier()`
accepts only a recorded stopped Agent worktree, snapshots tracked and regular
untracked changes, reproduces them in a detached grader worktree, injects
hash-verified assets with create-new semantics, executes the verifier, and
cleans only that recorded grader worktree after evidence is complete. Integrity
errors retain the grader worktree for inspection.

`mineGitHistory()` performs read-only local commit selection and reconstructs
each linear parent in a disposable Git worktree. Candidates contain privacy-safe
author provenance, exact reference/implementation/test patch hashes, file
classification, explicit exclusion reasons, and an immutable pending-review
flag. Root/merge, empty, oversized, binary, unsafe/sensitive, implementation-less,
and test-less changes are filtered rather than silently accepted.

`fetchGitHubMetadata()` is opt-in enrichment through the user's normal `gh`
authentication. It records no token or auth-store content, normalizes
commit-associated PRs and closing issues, hashes query/response provenance, and
caches available results by commit. Missing `gh`, auth, repository/network data,
or malformed responses return explicit `unavailable` evidence; local mining does
not depend on this function.

`createTaskSplit()` implements the versioned `category-hash-v1` train,
validation, and final-holdout split. Manifests commit to the seed, immutable task
set, assignments, per-category counts, and undisclosed holdout membership.
Optimization views omit holdout IDs, `assertSplitAccess()` rejects cross-phase
task use, and `openFinalHoldout()` emits a separately hashed audit record.
Teaching protocol ledgers add content-addressed proposal/selection accesses,
bind the single final gate to a frozen candidate and policy, record a terminal
outcome, set `retuneAllowed: false`, and refuse later tuning on the same
manifest.

`checkTaskValidity()` replays baseline and reviewed-reference snapshots in fresh
recorded worktrees at least twice. It verifies task/reference hashes, setup state,
verifier commands, and assertions; flags already-passing baselines, reference
solutions that never pass, setup/environment failures, and varying outcomes;
hashes the report; and removes only its recorded replay worktrees.

`checkGraderIntegrity()` revalidates the immutable task/config commitments,
baseline worktree ownership, every referenced asset, split-phase access, protected
and hidden-mount paths (including ignored files), Agent-visible roots and inputs,
and changed-file content immediately before grading. Findings persist only hashes,
logical paths, and match kinds—not hidden bytes or absolute verifier paths. Any
tamper or disclosure is `compromised`; host-only hidden-verifier execution is
`unknown`, and only a caller-confirmed enforced filesystem boundary can be
reported as `valid`.

`calculateRepeatedRunStatistics()` groups one task/variant's immutable trial
observations, excludes `not_graded` and non-valid-integrity trials from the
correctness denominator, and reports those exclusions separately. `pass@k` is
the finite-sample without-replacement estimate of at least one success;
`pass^k` is the plug-in `successRate ** k` scenario under an explicitly declared
independence assumption. Reports also include Bernoulli sample variance,
standard error, a 95% Wilson interval, sorted failure categories, source/report
hashes, and mandatory small-sample, dependence, exclusion, or missing-data
caveats.

The repository's versioned reference inventory contains ten JavaScript,
Python, and repository-configuration recipes under
`fixtures/reference-suite`. `pnpm test:reference` reconstructs their Git
histories and exercises initialization, grading, assertions, mining, external
hidden verifier injection, splitting, host-integrity limitations, flake
detection, statistics, and exact cleanup without an Agent or network call.
