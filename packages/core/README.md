# @patchrace/core

Side-effect-controlled execution services for PatchRace: versioned suite loading, immutable run artifacts, exact Git worktrees, bounded process groups, concurrent scheduling, budgets, race planning/execution, interruption recovery, redacted export, environment inspection, and exact-target cleanup.

The versioned suite schema and normalized wire types are owned and exported by `@patchrace/contracts`, including `@patchrace/contracts/schemas/suite-v1.json`. Core re-exports the TypeScript surface for compatibility. Worktrees isolate repository state, not the host; repository commands remain user-trusted executable code.

`createRacePlan` freezes task snapshots before allocating trials and keeps model,
harness, and workflow identity independent. `executeRacePlan` uses the shared
scheduler/budget layer and an injected trial boundary, so retries and paid work
cannot occur silently.

Comparison baselines are create-new files with explicit format migration views;
source baseline evidence is never rewritten. Regression inputs preserve missing
metrics and keep promotion decisions separate from activation.

Shareable report export is a two-step preview/confirm workflow. It selects only
derived report files, commits source/export hashes and redaction findings, refuses
drift or in-place output, and writes a separate create-new tree.
