# CLI and Configuration Contract

Status: accepted for v0.1 by `ARC-02`  
Last updated: 2026-07-22

## Interface rules

The executable is `patchrace`. Human progress and diagnostics go to `stderr`; requested machine data goes to `stdout`. Commands do not prompt when `--json` or `--no-input` is present. Destructive or publication actions require an explicit flag even in an interactive terminal.

Global options:

```text
--config <path>       suite config; default .patchrace/suite.yaml
--project <path>      trusted repository root; default Git top-level
--state-dir <path>    default <project>/.patchrace
--json                one JSON value, or JSONL for streaming commands
--no-input            fail rather than prompt
--log-level <level>   error|warn|info|debug
--version             CLI and schema versions
--help
```

Paths are resolved relative to the config file unless a field says otherwise, then canonicalized. Config and CLI values are passed as structured process arguments; no implicit shell interpolation occurs. Secret values are referenced by environment-variable name, never embedded in normalized output.

## Commands

### `init`

Creates a reviewable suite without invoking an agent or executing repository code.

```bash
patchrace init
patchrace init --from-history --limit 10 --output .patchrace/suite.yaml
```

Flow: validate Git root → inventory tools → create missing directories/config examples with create-new semantics → validate normalized suite → print next steps. Existing files are never overwritten without `--force`, and `--force` writes a sibling backup first. Success means a valid editable suite exists.

### `mine`

Produces task candidates for review; it never silently activates them.

```bash
patchrace mine --since v1.2.0 --max 20
patchrace mine --commit abc123 --github-metadata --json
```

Flow: inspect local history → reconstruct parent/commit evidence in temporary worktrees → detect tests/reference changes and exclusions → optionally call user-authenticated `gh` → write candidates under `.patchrace/mined/` → require `patchrace task accept` or manual suite edits. Invalid/flaky/leaky candidates are labeled, not discarded without evidence.

### `run` and `race`

`race` is an alias for `run --compare`; both create durable runs.

```bash
patchrace run --suite smoke --variant pi-baseline
patchrace race --suite validation --variants pi-baseline,claude,codex --repeat 3
patchrace run --resume run_01J... --json
```

Flow: validate and freeze config/task/variant hashes → preflight versions/auth/budgets → reserve run ID/artifacts → create worktrees → invoke trials → normalize events → inject hidden verifier → grade → finalize results → optionally render report. `--resume` accepts only compatible interrupted checkpoints and never duplicates a completed trial. `--detach` is not in v0.1.

### `report`

Purely regenerates presentations from durable artifacts.

```bash
patchrace report run_01J...
patchrace report run_01J... --format html --output ./report
patchrace report run_01J... --format json --redacted --preview
```

Raw local report generation is non-publishing. `--redacted` writes a distinct export tree. Any future destination needs both `--publish <destination>` and `--confirm-publish`; v0.1 may omit publishers without changing local behavior.

### `diagnose`

```bash
patchrace diagnose run_01J... --focus pi-baseline
patchrace diagnose run_01J... --focus pi-baseline --format html --output ./diagnosis
patchrace diagnose run_01J... --reflect --json # only with a configured provider
```

Flow: verify comparable task/baseline → read durable normalized trace/result/grade
artifacts without rerunning work → extract deterministic features and alignment →
emit evidence-linked findings and workflow/capability classification → optionally
send only an explicitly redacted bounded evidence bundle to a configured
reflection provider → record alternatives/confidence/unsupported dimensions.
Reflection cannot change hard facts or grades; `--reflect` fails closed when no
provider is configured.

### `teach`

```bash
patchrace teach pi run_01J... --target skill
patchrace teach pi --suite training --baseline pi-main --budget-usd 25
```

Flow: enforce evidence tier/split access → select eligible Pi failures → derive bounded mutation proposals → stage one declared mutation per ablation → validate within budgets → optionally perform the one-time holdout gate → record `promote`, `hold`, or `reject` recommendation. It never writes global Pi state and never activates executable extensions.

### `candidate`

```bash
patchrace candidate review cand_0123...
patchrace candidate decide cand_0123... --approve --reason "Exact evidence is ready for validation."
patchrace candidate decide cand_0123... --reject --reason "The proposed instruction is too broad."
```

Flow: load only the canonical project-local staged candidate root → verify
candidate/review lineage and exact staged bytes → return diff, safety,
validation, selection, and promotion evidence → append one terminal
approve-for-validation or reject decision. The original pending review remains
immutable; approval does not activate or promote the candidate.

### `promote`

```bash
patchrace promote cand_01J... --preview
patchrace promote cand_01J... --confirm --target project
```

Flow: verify candidate hashes and successful gates → show exact destination/diff/rollback plan → require `--confirm` → apply only to approved project-local paths atomically → record pre/post hashes and promotion ID. It does not commit, push, publish, or touch global Pi files.

### `rollback`

```bash
patchrace rollback promotion_01J... --preview
patchrace rollback promotion_01J... --confirm
```

Flow: verify current files still match the promoted postimage → show reverse
plan → require confirmation → restore exact preimages atomically. A diverged
file causes conflict exit and no overwrite; the retained promotion record
supports explicit recovery review.

### `doctor`

```bash
patchrace doctor
patchrace doctor --adapter codex --json
```

Reports Git/Node/CLI versions, supported ranges, config validity, filesystem capacity, worktree support, and adapter auth readiness without displaying credential contents. Each failure includes a remediation action. It executes no agent task.

### `clean`

```bash
patchrace clean --run run_01J... --dry-run
patchrace clean --run run_01J... --worktrees --confirm
patchrace clean --cache --older-than 30d --confirm
```

Dry run is the default and lists canonical exact targets, ownership evidence, retention class, and estimated bytes. Deletion requires `--confirm`, refuses symlink escapes/broad roots/unrecorded paths, serializes Git worktree operations, and retains on ambiguity. Raw run evidence is not selected unless `--artifacts` is explicit.

## Stable exit semantics

The most severe encountered category determines the process exit code. Per-trial outcomes remain in result JSON.

| Code | Symbol | Meaning |
|---:|---|---|
| 0 | `OK` | Command completed; all required gates passed. |
| 1 | `OUTCOME_NOT_PASSED` | Valid run completed, but task/candidate/promotion gates did not pass. |
| 2 | `USAGE` | Invalid arguments, incompatible flags, or unknown command. |
| 3 | `CONFIG` | Config/schema/path validation failed. |
| 4 | `PREFLIGHT` | Required tool, version, capability, auth, or trusted precondition unavailable. |
| 5 | `EXECUTION` | Adapter/subprocess/protocol failed independently of task correctness. |
| 6 | `GRADER` | Grader infrastructure or integrity failed; result is not a task failure. |
| 7 | `INTERRUPTED` | User/system cancellation finalized partial evidence. |
| 8 | `BUDGET` | Declared time/run/token/cost/disk budget stopped or rejected work. |
| 9 | `CONFLICT` | Resume, promotion, rollback, lock, or cleanup ownership conflict. |
| 10 | `SAFETY` | Refused unsafe path, hidden-asset leak, tampering, or forbidden mutation. |
| 11 | `INTERNAL` | Invariant violation or unclassified product defect. |

Signals map to `INTERRUPTED` after bounded cleanup; if the process cannot finalize, conventional `128 + signal` may be observed and startup recovery must detect the partial run.

Machine errors use:

```json
{
  "schemaVersion": "1.0.0",
  "ok": false,
  "error": {
    "code": "ADAPTER_AUTH_UNAVAILABLE",
    "category": "PREFLIGHT",
    "message": "Codex is installed but not authenticated.",
    "path": "variants[2].adapter",
    "retryable": false,
    "remediation": "Run `codex login`, then retry `patchrace doctor --adapter codex`."
  }
}
```

## Suite configuration schema

YAML and JSON are accepted and normalized to the same JSON value. Unknown keys are errors except inside `metadata`. Versions use semantic versioning: major is incompatible, minor adds optional/defaulted fields, patch clarifies validation without semantic change.

```yaml
schemaVersion: 1.0.0
project:
  root: ..
  trustRepositoryCommands: false
state:
  directory: .patchrace
  retention:
    rawRuns: manual
    cacheDays: 30
defaults:
  concurrency: 2
  repeat: 1
  budgets:
    wallSeconds: 1200
    trialSeconds: 600
    maxTrials: 30
    maxTokens: null
    maxCostUsd: null
    diskMiB: 2048
  environment:
    inherit: [PATH, LANG, LC_ALL, TERM]
    pass: []
    redact: []
adapters:
  pi:
    kind: pi
    executable: pi
    execution: cli
    version: ">=0.81 <0.82"
  claude:
    kind: claude-code
    executable: claude
  codex:
    kind: codex
    executable: codex
variants:
  pi-baseline:
    adapter: pi
    model: null
    harness: { resources: project }
    workflow: { candidate: null }
  codex-default:
    adapter: codex
    model: null
    harness: { sandbox: workspace-write }
    workflow: { candidate: null }
suites:
  smoke:
    tasks: [add-regression]
    split: validation
tasks:
  add-regression:
    file: tasks/add-regression/task.yaml
objectives:
  policy: correctness-first-v1
  afterHardGates: [stability, cost, latency, footprint]
report:
  formats: [json, html]
  includeRawCode: local-only
  redactionProfile: default
metadata: {}
```

### Validation invariants

- `schemaVersion`, at least one adapter, variant, task, and suite are required.
- Map keys are stable IDs matching `^[a-z][a-z0-9-]{0,63}$`; display names live in metadata.
- A suite task reference and variant adapter reference must resolve exactly once.
- Budgets are finite non-negative numbers; `null` means unavailable/unset, never infinity or zero cost.
- `repeat * tasks * variants` must not exceed `maxTrials` unless the user explicitly raises it.
- Environment values are names, not captured secrets. `pass` entries require an export warning; `redact` may add literal values only through runtime secret providers.
- A redacted report reloads the exact frozen config and reads only the environment
  names explicitly listed in `defaults.environment.redact`. Missing or
  shorter-than-four-character values, configuration drift, and unsupported
  named profiles fail closed. Values never enter config, argv, preview,
  manifest, or result records.
- Every command field in a task is an argv array or an explicitly labeled `shell` object. Plain strings are not implicitly executed.
- Paths cannot contain unresolved variables, traverse outside allowed roots, or name repository/root/home/broad cleanup targets.
- A holdout suite cannot be selected by `diagnose --reflect` or `teach` except the recorded final gate.
- Variant identity includes adapter executable/version, model, harness settings, resource hashes, environment-name set, and task hash.

## Normalized configuration

Before a run, PatchRace writes canonical JSON with sorted object keys, explicit defaults, POSIX-style relative logical paths, and no secrets. The SHA-256 of UTF-8 canonical JSON is the config identity. Runtime-resolved absolute paths and executable versions go into provenance, not back into the source config.

The full local comparison report may contain patches and observable trace
details. A separate `report/shareable/` projection removes code, changed and
artifact paths, trajectory details, executable/harness/workflow settings,
environment names, and free-text limitations before configured redaction.
`report --redacted` accepts only that projection; diagnosis and candidate output
remain local-sensitive and have no shareable label.

## Compatibility and deprecation

A newer CLI may read an older same-major schema and records the migration result in the run; it never edits the user's source config implicitly. Reading a newer major fails with `CONFIG`. CLI flags remain supported for at least one minor release after a deprecation warning. Machine error codes and exit categories are additive within major version 1.

## Acceptance checklist

All required command names have an example, flow, side-effect boundary, confirmation behavior, machine-output rule, and exit category. The schema covers project/state, budgets, environment, adapters, variants, suites/tasks, objectives, reports, versioning, normalization, and safety validation.
