# Immutable Run Artifact Contract

Status: current v0.1 contract
Last updated: 2026-07-22

## Goals

A run must remain identifiable, auditable, resumable, and renderable after interruption or adapter drift. Raw vendor bytes and deterministic grading evidence are preserved; completed evidence is never rewritten during report generation or schema migration.

## Identity

`runId` is `run_<ULID>` and `trialId` is `trial_<ULID>`. ULIDs provide sortable allocation identity, not reproducibility identity. Each manifest also stores:

- `planHash`: SHA-256 of canonical config, selected task snapshots, variants, repeats, and declared budgets;
- `taskHash`: SHA-256 of canonical task contract plus referenced baseline/verifier content hashes;
- `variantHash`: SHA-256 of normalized adapter/model/harness/workflow declaration;
- `attempt`: positive integer; retries receive new trial IDs and point to `supersedesTrialId`;
- `contentKey`: `sha256(taskHash + variantHash + attemptPolicyHash)` for cache lookup, never used as a writable path without validation.

IDs are lowercase Crockford Base32 and validated before path use. Two runs with equal plan hashes remain distinct executions with independent provenance.

## Directory and lifecycle

The layout is defined in `SYSTEM_ARCHITECTURE.md`. Directories are created with owner-only permissions where supported. Files have lifecycle classes:

| Class | Examples | Rule |
|---|---|---|
| reserved | directory, empty event log | create-new only |
| append-only | `events.jsonl`, raw streams, normalized trace | append complete newline-delimited records; truncate only an invalid final partial line during recovery and record it |
| finalized | manifest snapshot, invocation, patch, grade, metrics, result | write temp sibling, fsync where supported, hash, atomic rename; never replace |
| coordinator | `status.json`, lease | atomic replace; not authoritative evidence |
| derived | report JSON/HTML, redacted export | reproducible from finalized inputs; separate versioned output path |

Completed trials never reopen. Resume creates missing downstream artifacts or a new attempt; it does not append a second result.

## Manifest

`manifest.json` is finalized after planning and preflight, before agent execution:

```json
{
  "schemaVersion": "1.0.0",
  "runId": "run_01JABC...",
  "createdAt": "2026-07-22T12:00:00.000Z",
  "planHash": "sha256:...",
  "source": {
    "repository": {"logicalPath":".","remoteHash":null,"commit":"40hex"},
    "configHash": "sha256:...",
    "suiteId": "smoke",
    "split": "validation",
    "splitHash": "sha256:..."
  },
  "controller": {"version":"0.1.0","node":"22.22.1","platform":"darwin-arm64"},
  "budgets": {"wallSeconds":1200,"maxTrials":30,"maxTokens":null,"maxCostUsd":null},
  "trials": [{
    "trialId":"trial_01JDEF...",
    "taskId":"add-regression",
    "taskHash":"sha256:...",
    "variantId":"pi-baseline",
    "variantHash":"sha256:...",
    "attempt":1,
    "paths":{"worktree":"worktrees/run_.../trial_...","artifacts":"trials/trial_..."}
  }],
  "artifactIndexVersion": "1.0.0"
}
```

Hostnames, usernames, absolute home paths, credential locations, and environment values are excluded. A separate local-only provenance record may contain canonical absolute paths and is redacted for export.

## Invocation and provenance

`invocation.json` records:

- executable logical name, resolved executable path hash, version output, adapter contract version;
- vendor argv with prompt bodies replaced by content hashes and secrets replaced
  by named redaction markers; execution-only prefix arguments are represented
  by ordered SHA-256 hashes so local interpreter/script paths are not copied;
- working directory as run-relative logical path;
- inherited/passed environment variable names only;
- auth state `ready|missing|expired|unknown`, never tokens or token-file contents;
- model/provider identifier as reported, harness/workflow resource content hashes;
- start/end timestamps, monotonic durations, PID/process-group ownership metadata in local-only form;
- sandbox/approval capabilities requested and actually reported;
- raw output encoding and parser version.

Repository provenance includes baseline commit, dirty-state refusal/allowance decision, submodule/LFS status when relevant, worktree porcelain snapshot, setup command hashes, hidden verifier hash, and final `git status --porcelain=v2` plus patch hash.

## Raw logs and vendor events

`raw/stdout.log` and `raw/stderr.log` are byte-preserving streams with a sidecar containing encoding, byte count, truncation state, and SHA-256. If the vendor offers JSON/JSONL, unmodified records additionally go to `raw/vendor-events.jsonl`. PatchRace may cap displayed output, but evidence truncation must be declared with original/retained sizes when known.

Raw artifacts are local-sensitive and are not automatically redacted in place. A redacted export is a new tree with its own hashes and redaction manifest.

## Patch

`patch.diff` is produced by Git from the baseline with binary markers and renames enabled. `patch.json` records:

```json
{
  "schemaVersion":"1.0.0",
  "baselineCommit":"40hex",
  "diffHash":"sha256:...",
  "changedFiles":[{"path":"src/add.ts","status":"modified","oldPath":null,"binary":false,"insertions":1,"deletions":1}],
  "untrackedIncluded":true,
  "submoduleChanges":[],
  "protectedPathViolations":[]
}
```

Paths are repository-relative UTF-8 logical paths. Unrepresentable paths are retained through Git's quoted form and flagged. The patch is evidence, not an instruction to apply automatically.

## Grade and metrics

`grade.json` separates infrastructure validity from task outcome:

```json
{
  "schemaVersion":"1.0.0",
  "integrity":"valid",
  "outcome":"passed",
  "hardGates":[{"id":"tests","status":"passed","evidence":["commands/test.json"]}],
  "assertions":[],
  "graderErrors":[],
  "hiddenVerifierHash":"sha256:...",
  "taskHash":"sha256:..."
}
```

`metrics.json` uses `{value, unit, availability, source}` records. Duration is monotonic milliseconds. Token/cost metrics distinguish input, cached input, output, reasoning where reported, currency, and source. `unavailable` is not zero. Derived metrics name their formula version and inputs.

`result.json` summarizes terminal state (`completed|failed|cancelled|interrupted|budget_exhausted`), task outcome, grade/patch/trace hashes, normalized adapter error if any, budget consumption, and completion timestamp. It contains no evidence that is not linked to an artifact.

## Hashing and artifact index

- Algorithm: SHA-256; encoded `sha256:<lowercase hex>`.
- Canonical JSON: UTF-8, Unicode preserved, object keys lexicographically sorted, arrays ordered, no insignificant whitespace, finite JSON numbers only, newline excluded from hash.
- Byte artifacts: hash exact stored bytes.
- Directory identity: hash a sorted list of `{logicalPath, modeClass, size, contentHash}`; symlinks hash their link text and are never followed for identity.
- Secret-bearing runtime values are excluded or replaced before hashing identity documents; hashes are not claimed to anonymize low-entropy data.

`artifact-index.json` is finalized last and lists logical path, media type, schema version if any, sensitivity (`local-sensitive|local|export-safe`), size, hash, producer/version, and dependencies. The index excludes itself; its own hash is recorded in `result.json` or run completion event.

## Event log and recovery

Every coordinator transition is a JSONL record with sequence, event ID, run/trial ID, UTC timestamp, monotonic offset, type, prior/new state, and referenced artifact hashes. Sequence gaps, duplicate terminal events, or hash mismatch make the run `needs_inspection`.

Recovery procedure:

1. acquire or safely recover the run lease;
2. validate run root ownership and canonical paths;
3. parse complete event records, quarantining only a partial last line;
4. verify all finalized hashes and Git worktree ownership;
5. detect recorded process groups without signaling unrelated/reused PIDs;
6. reconstruct coordinator status;
7. resume only idempotent unstarted/finalization/grading steps, otherwise create a new attempt;
8. append a `recovery.completed` record with all decisions.

## Schema evolution

Every JSON/JSONL record has `schemaVersion`; event records also have a stable `type`. Major versions are incompatible. Minor versions add optional fields/event types; readers ignore only explicitly extensible unknown fields and preserve raw records. Patch versions clarify validation.

Migrations are pure derived views: `patchrace report` may materialize `derived/v2/...` from v1 artifacts, recording tool version, input hashes, output hashes, and warnings. It never overwrites raw or finalized v1 evidence. A reader that cannot safely interpret a required field fails clearly instead of guessing.

## Export and retention

An export manifest enumerates included/excluded artifact classes, redaction profile/version, findings, residual warning, source hashes, and export hashes. Raw code, prompts, paths, and logs default to excluded from shareable export. The comparison workflow materializes a distinct `report/shareable/` projection that removes patches, trajectories, evidence links, executable/harness/workflow details, environment names, and free-text trial limitations before configured redaction. The export selector refuses the complete local report and accepts only that projection. Runs persist until explicit safe cleanup; cache is the only automatically disposable class under the configured policy.

## Acceptance mapping

Run IDs, manifests, logs, patches, grades, metrics, provenance, hashes, immutability/recovery, sensitivity, and schema-version rules are explicitly defined and reference the architecture safety invariants.
