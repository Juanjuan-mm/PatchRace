# Contributing a Grader

Last updated: 2026-07-23

PatchRace grading answers a narrow deterministic question: did the exact Agent
snapshot satisfy the reviewed task contract? A grader does not decide which
Agent is generally best, reconstruct intent, repair a patch, use hidden
chain-of-thought, or let a soft/LLM score rescue failed correctness.

PatchRace v0.1 exposes task-defined command and assertion grading through
`@patchrace/contracts` and `@patchrace/tasks`. It does not yet load arbitrary
third-party grader packages at runtime. The architecture reserves a versioned,
bounded subprocess protocol for future external graders; implementing that
loader is a product/architecture task, not a documentation shortcut.

Read the normative [task and grader contract](architecture/TASK_AND_GRADER.md),
[run artifact contract](architecture/RUN_ARTIFACTS.md), and
[security guide](SECURITY_PRIVACY_AND_CLEANUP.md).

## Prefer task composition

Most new ecosystem support requires no new TypeScript grader. Express the
verifier as `TaskCommandV1[]` and combine existing `TaskAssertionV1` kinds:

```ts
import type {
  TaskAssertionV1,
  TaskCommandV1,
  TaskV1,
} from "@patchrace/tasks";
import {
  evaluateTaskAssertions,
  runTaskCommandPhase,
} from "@patchrace/tasks";

const commands: readonly TaskCommandV1[] = [
  {
    id: "test",
    kind: "test",
    argv: ["go", "test", "./..."],
    timeoutSeconds: 120,
    expectedExitCodes: [0],
    network: "forbidden",
  },
];

const assertions: readonly TaskAssertionV1[] = [
  { id: "protected", kind: "protected-paths", paths: [".github/**"] },
  {
    id: "scope",
    kind: "diff-limit",
    maxChangedFiles: 8,
    maxLines: 300,
    allowDependencyChanges: false,
    allowLockfileChanges: false,
  },
  { id: "test-passed", kind: "command", commandId: "test" },
];

async function grade(task: TaskV1, graderWorktree: string, evidence: string) {
  const commandEvidence = await runTaskCommandPhase({
    task,
    phase: "verifier",
    workingDirectory: graderWorktree,
    evidenceDirectory: evidence,
  });
  return evaluateTaskAssertions({
    task,
    workingDirectory: graderWorktree,
    baselineCommit: task.baseline.commit,
    commandEvidence: commandEvidence.commands,
  });
}
```

Use argv whenever possible. A `{shell, shellKind}` command is explicitly trusted
arbitrary host code and may contain only reviewed static repository syntax; do
not interpolate task/config/environment values into it.

Built-in assertions cover required, forbidden, and protected paths; exact/
regex/hash file content; changed file/line/binary/dependency/lockfile limits;
repository cleanliness; command outcomes; patch/baseline invariants; and
hidden-asset non-disclosure.

## When a new assertion or grader behavior is justified

Add code only when task composition cannot express a deterministic requirement.
Before implementation, define:

- the observable input and exact result semantics;
- whether failure means Agent failure, invalid task, environment problem,
  grader infrastructure error, integrity compromise, or unavailable evidence;
- evidence references and byte/time/disk bounds;
- cross-platform behavior and unavailable behavior;
- how baseline failure and a reviewed reference success prove discrimination;
- security/privacy risks and cleanup ownership.

A new assertion kind changes the public `TaskAssertionV1` union, JSON Schema,
loader validation, grading result contract, generated schemas, docs, fixtures,
and all exhaustive consumers. That is a user-visible contract change and
requires a Changeset. A new runtime dependency requires the dependency review;
a new execution or isolation promise normally requires an ADR.

Put wire types/schemas in `@patchrace/contracts`, deterministic grading behavior
in `@patchrace/tasks`, shared process/artifact/cleanup primitives in
`@patchrace/core`, and only argument/presentation wiring in the CLI. Graders
must not import adapters, diagnosis, optimizer, report, CLI, or Pi-extension
source.

## Correctness and integrity rules

Only `integrity: valid` plus every required hard gate passed can produce
`outcome: passed`. Preserve these distinctions:

- `failed`: valid evidence says the Agent patch did not meet a required gate;
- `not_graded`: the trial could not receive a valid correctness judgment;
- `error`: grader/infrastructure invalidity, not Agent failure;
- `compromised`: detected task/config/verifier/protected-path/leakage tampering;
- `unknown`: enforcement or inspection is insufficient to claim integrity.

Optional/skipped checks must have a reason. Scores and LLM judgments are
secondary and cannot override a hard gate. Missing values stay unavailable.
Evidence paths are logical/repository-relative; never persist a hidden vault
path, credential, environment value, or hidden matched content.

## Hidden verifier lifecycle

Hidden assets remain outside the repository, Agent worktree/cwd, prompt,
resources, caches, and sessions. After the Agent and its owned process group
stop:

1. revalidate task/config/verifier hashes, split authorization, baseline,
   protected paths, Agent-visible surfaces, and worktree ownership;
2. snapshot the exact Agent patch;
3. create a recorded grader-only worktree or controlled overlay;
4. inject hash-verified verifier assets with create-new semantics, refusing
   collisions, traversal, symbolic links, and hard-link escapes;
5. execute through the shared process runner with an allowlisted environment,
   no vendor auth, and explicit time/output/disk limits;
6. write create-only stdout/stderr/result evidence outside the worktree;
7. remove only recorded injected assets and the exact owned grader worktree
   after evidence is complete.

If the host backend cannot prevent same-user discovery of hidden material,
integrity is `unknown`; a Git worktree alone never supports a
leakage-resistant claim. A detected leak is `compromised` even if tests pass.

## Fixture design

Add a minimal deterministic repository fixture or construct one under a unique
temporary root. It must prove:

- the baseline fails the intended gate for the intended reason;
- a reviewed reference patch passes at least twice;
- setup success is not confused with Agent success;
- command failure, timeout, cancellation, spawn error, and unexpected exit are
  classified separately;
- every new positive path has malformed, missing, oversized, traversal/link,
  collision, or tamper negatives relevant to its inputs;
- protected paths, dirty/untracked state, unrelated files/worktrees, raw
  evidence, and hidden material are preserved appropriately;
- repeated replay is deterministic enough for an eligible task;
- no credential/provider access, network, clock, random ID, or personal path is
  hidden in a snapshot.

For hidden verifiers, add enforced-boundary and host-only cases. The former can
produce `valid`; the latter must produce `unknown`. Assert exact cleanup targets
and preservation of an external sentinel.

Do not commit private repositories, real vulnerability patches, credentials,
raw Agent traces, absolute home paths, or reference/holdout material into
Agent-visible fixtures. Synthetic fixtures should state that they prove
mechanics, not real-world grader quality.

## Verification and review

For command/assertion behavior:

```bash
pnpm exec vitest run packages/tasks/src/grader.test.ts
pnpm exec vitest run packages/tasks/src/assertions.test.ts
```

For hidden/integrity behavior:

```bash
pnpm exec vitest run packages/tasks/src/hidden-verifier.test.ts
pnpm exec vitest run packages/tasks/src/integrity.test.ts
```

For task discrimination and repeatability:

```bash
pnpm m5:reference
pnpm fixtures:verify
```

Before handoff:

```bash
pnpm check
pnpm m5:verify
pnpm qa:security
pnpm release:pack
pnpm supply-chain:licenses
```

The pull request must state the grader invariant, error classification, fixture
provenance, baseline/reference replay evidence, hidden-material boundary,
cleanup/unrelated-state assertions, limitations, documentation, Changeset, and
exact verification results. Never run a live Agent or expose private verifier
material merely to test deterministic grading.

