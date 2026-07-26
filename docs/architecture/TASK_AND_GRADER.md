# Task and Grader Contract

Status: current v0.1 contract
Last updated: 2026-07-22

## Task identity and eligibility

A task is an immutable contract rooted at an exact Git commit. Its `taskHash` covers canonical task JSON and every referenced instruction, setup asset, verifier asset, assertion config, budget, and provenance content hash. Editing any semantic input creates a new task revision.

A task is eligible only if the baseline can be prepared, the instruction does not expose the reference solution or hidden verifier, the verifier distinguishes baseline from the accepted target, repeated replay is sufficiently deterministic, and all executable inputs are explicitly trusted by the user.

## Version 1 shape

```yaml
schemaVersion: 1.0.0
id: add-regression
revision: 1
baseline:
  repository: .
  commit: 40-character-sha
  submodules: locked
  lfs: required
instruction:
  file: instruction.md
  hash: sha256:...
setup:
  commands:
    - id: install
      argv: [npm, ci, --ignore-scripts]
      timeoutSeconds: 120
  assets: []
verifier:
  visibility: hidden
  assets:
    - source: verifier/add.test.js
      mount: test/__patchrace__/add.test.js
      hash: sha256:...
  commands:
    - id: test
      kind: test
      argv: [npm, test, --, --runInBand]
      timeoutSeconds: 120
assertions:
  - {id: protected, kind: forbidden-paths, paths: [.github/**]}
  - {id: patch-size, kind: diff-limit, maxChangedFiles: 5, maxLines: 100}
budgets:
  trialSeconds: 600
  maxTokens: null
  maxCostUsd: null
  maxPatchLines: 100
provenance:
  source: git-history
  sourceCommit: 40-character-sha
  referencePatchHash: sha256:...
  createdAt: 2026-07-22T00:00:00Z
  reviewedBy: user
metadata:
  ecosystem: javascript
  category: bugfix
  split: validation
```

Unknown top-level keys are errors except `metadata`. Commands are argv arrays. An explicitly trusted `{shell, shellKind}` form is allowed only when argv cannot represent repository syntax; it is never interpolated with task/config values.

## Baseline

`baseline.repository` is a user-approved local repository logical reference; a run manifest records its canonical local path separately. `commit` must resolve to exactly one object and is expanded to a full SHA. Before setup, PatchRace verifies no uncommitted content is copied into the worktree. Submodule, LFS, sparse checkout, and platform requirements are explicit; unsupported requirements fail preflight.

Historical reconstruction resets to the selected commit's first parent unless provenance names another parent. Merge commits are rejected by default. The human reference patch is stored outside agent-visible paths and is used for task construction/audit, never as prompt context or a required exact solution.

## Setup

Setup runs in the prepared worktree before the agent with no hidden verifier present. For a hidden verifier, the same setup phase is replayed after the exact candidate patch is copied into the grader-only worktree and before any hidden asset is mounted. This reconstructs ignored dependency/build state without exposing hidden material to setup commands. Setup steps have IDs, argv/cwd, environment-name allowlist, timeout, expected exit codes, cache policy, and network requirement. They are trusted repository code and onboarding must say they can affect the host.

Initial and post-patch setup evidence are recorded independently and both must pass. Setup output and dependency state are hashed where practical. A failed setup is `task_invalid_or_environment`, not agent failure. Caches cannot contain hidden verifier assets or a reference patch.

## Instruction

The exact UTF-8 bytes delivered to each variant are hashed. Adapter wrappers may add a versioned neutral execution preamble (worktree scope, final response expectation), whose hash becomes part of variant identity. Agent-specific coaching belongs to the workflow dimension, not the common task instruction.

## Hidden verifier and isolation

Verifier sources reside outside the repository, run worktree, agent cwd, adapter additional directories, environment, prompt, resource loaders, caches, and agent session inputs. Only the grader process receives their canonical source path.

After the agent process exits and its process group is confirmed stopped, the grader:

1. verifies task/config/verifier hashes and final agent worktree ownership;
2. snapshots the agent patch;
3. creates a grader-only worktree or controlled overlay from that exact snapshot;
4. replays setup in that grader worktree while no hidden asset is present;
5. injects verifier assets using create-new semantics and rejects path/symlink escapes or collisions;
6. runs verifier commands with a constructed environment and no vendor auth;
7. records results and removes only the verified injected paths/grader worktree;
8. checks the original agent patch did not touch protected scoring/config paths.

If the platform cannot prevent the agent from seeing hidden assets, hidden verification is unavailable and the task cannot claim leakage-resistant evidence. Agent edits to scoring config or forged result files are hard integrity failures even when tests pass.

The pre-grade integrity check revalidates task/config commitments, the recorded
baseline HEAD, all referenced content hashes, split-phase authorization, protected
and ignored paths, hidden mount collisions, declared Agent-visible directories and
prompt surfaces, and changed-file content. Its durable evidence contains only
repository-relative/logical paths, hashes, indices, and match kinds. It never
copies the hidden matched content or canonical vault path into the result. A
violation is `compromised` regardless of verifier success; incomplete inspection
or host-only filesystem separation is `unknown`.

## Assertions

Built-in deterministic assertion kinds:

- `required-paths`, `forbidden-paths`, `protected-paths`;
- `file-content` with exact/regex/hash rules and explicit encoding;
- `diff-limit` for files/lines/binary/dependency/lockfile changes;
- `repository-cleanliness` and allowed untracked paths;
- `command` for build/test/lint/typecheck with declared expected exit/status;
- `patch-applies`, baseline/ref invariants, and hidden-asset non-disclosure.

Assertions return `passed|failed|error|skipped`. `error` indicates grader/infrastructure invalidity and cannot be ranked as agent failure. Optional assertions must name why they may skip.

## Budgets

Task budgets can tighten but not exceed suite/run safety limits. Wall time,
agent time, setup/grader time, trial count, tokens, cost, output bytes,
structured record count, patch size, files changed, and disk may be bounded.
Unsupported token/cost enforcement is declared before execution; a monetary
budget cannot be claimed enforced when the adapter reports no usable cost
signal.

Budget exhaustion is a terminal trial state with partial evidence, not an infrastructure crash. Setup/verifier time is reported separately so slow tests are not blamed on the agent.

## Grader interface

```ts
interface GraderContext {
  taskSnapshot: Readonly<TaskV1>;
  agentSnapshot: { baselineCommit: string; patchHash: string; worktree: LogicalPath };
  graderRoot: OwnedPath;
  artifactWriter: FinalizeOnlyWriter;
  signal: AbortSignal;
}

interface Grader {
  readonly id: string;
  readonly version: string;
  validate(task: TaskV1): ValidationIssue[];
  grade(context: GraderContext): Promise<GradeResultV1>;
}
```

Graders receive no adapter process, vendor credentials, global Pi write access, or mutable run manifest. External graders are subprocesses with versioned JSONL protocol, explicit capabilities and time/size limits. stdout is protocol-only; stderr is captured evidence.

## Result

```json
{
  "schemaVersion":"1.0.0",
  "taskId":"add-regression",
  "taskHash":"sha256:...",
  "trialId":"trial_01J...",
  "integrity":"valid",
  "outcome":"passed",
  "hardGates":[
    {"id":"test","kind":"command","status":"passed","durationMs":843,"evidenceRef":"commands/test.json"}
  ],
  "assertions":[],
  "budget":{"status":"within","exhausted":[]},
  "infrastructureErrors":[],
  "limitations":[],
  "grader":{"id":"builtin","version":"1.0.0"}
}
```

`integrity` is `valid|compromised|unknown`. Overall `outcome` is `passed|failed|not_graded`; only `integrity:valid` plus all required hard gates passed yields `passed`. Scores/soft metrics are optional and never override this rule.

## Repeated-run statistics

Statistics are computed per exact task and variant identity. Only `passed` or
`failed` trials with `integrity:valid` enter the correctness denominator;
`not_graded`, `compromised`, and `unknown` trials remain visible as exclusions.
The report defines `pass@k` as the finite-sample without-replacement estimate of
at least one success, and `pass^k` as the `successRate ** k` plug-in scenario for
all-success reliability under declared independence. Every report retains exact
counts, Bernoulli sample variance, standard error, a 95% Wilson interval, failure
categories, source/report hashes, and explicit caveats for samples below 30,
unknown independence, exclusions, or unavailable estimates. Neither metric is a
confidence guarantee or a substitute for task-level evidence.

## Mining and split controls

Mined tasks preserve source commit/parent, discovery query, extraction tool version, reference patch hash, verifier origin, exclusions, and human review. Train, validation, and holdout membership is deterministic from a recorded split manifest/hash. The optimizer receives only train-visible task IDs/evidence; validation selects candidates; the final holdout is opened once for the recorded gate and cannot feed new mutations.

## Acceptance mapping

Baseline, setup, instruction, hidden verifier, assertions, budgets, results, provenance, grader isolation, integrity states, and executable-input risks are fully specified.
