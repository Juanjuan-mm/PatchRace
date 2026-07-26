# Live-provider end-to-end check

Last verified: 2026-07-23

PatchRace `v0.1.0-rc.2` was exercised with a real Pi CLI and a real DeepSeek
model call. This check exists to cover the boundary that deterministic fixtures
cannot: provider authentication, structured Pi output, live adapter parsing,
budget accounting, grading, reporting, diagnosis, and cleanup in one flow.

## Configuration

| Item | Value |
|---|---|
| Pi CLI | `0.81.1` |
| Provider/model | DeepSeek / `deepseek-v4-flash` |
| Trials and concurrency | 1 / 1 |
| Token ceiling | 4,096 |
| Cost ceiling | US$0.05 |
| Trial/wall ceilings | 90 s / 120 s |
| Disk ceiling | 64 MiB |
| Task | Replace one line in one tracked text file |

The credential was injected only into the child process environment. It was
not placed in PatchRace configuration, command arguments, the test repository,
or committed evidence.

## Result

- the executable/version/capability checks passed;
- the task trial completed and passed setup, verifier, and assertion gates;
- Pi reported 1,740 tokens and an observed cost of US$0.0000189392;
- the trial took about 3.30 seconds and changed exactly one file;
- JSON, standalone HTML, JUnit, and SARIF reports were generated;
- the primary repository and unrelated state remained unchanged;
- cleanup dry-run selected only the recorded run root, and confirmed cleanup
  removed that root while preserving the primary worktree;
- an exact-value scan found zero occurrences of the injected credential in the
  retained run/report artifacts.

The successful-trial diagnosis regression discovered during this exercise is
fixed in `v0.1.0-rc.2`: a valid passing trial whose hard gates all pass has no
failure finding and records `trial_passed_no_failure_to_diagnose`.

## Limits

This was one deliberately tiny paid run, not a model-quality benchmark or a
pricing guarantee. Exact-value scanning cannot prove removal of unknown,
encoded, transformed, or model-reproduced secrets. Agent and repository
processes still execute with the invoking user's host authority.

## Stable-release parity profile

The stable release adds a reproducible, fail-closed parity harness for Pi,
Claude Code, and Codex on the same nontrivial repository task. The task starts
from the public `v0.1.0-rc.2` PatchRace TypeScript monorepo and asks each Agent
to implement complete Node 26 support across package metadata, runtime doctor
behavior, platform verification, CI, documentation, and regression coverage.
This is a seeded regression on a real repository, not an upstream issue
benchmark.

Preparation is provider-free:

```bash
corepack pnpm qa:live:prepare
```

The command creates a no-hardlink local clone under ignored
`.artifacts/live-e2e/`, freezes the exact baseline commit, writes a hashed
instruction and public verifier, and prints a `prepared.json` path. It makes no
Agent or provider call.

Execution requires a separate local authorization JSON. It must set
`approved: true`, an unexpired `expiresAt`, `taskProfile:
"patchrace-node26-v1"`, exact repeat/concurrency, aggregate wall/token/cost
ceilings, and exactly one Pi, Claude Code, and Codex variant. Every variant
must name its executable, provider, and model. Credential values never belong
in this file; only explicitly approved child-environment names may be listed.

The shape is:

```json
{
  "schemaVersion": "1.0.0",
  "approved": true,
  "approvedAt": "2026-07-24T00:00:00Z",
  "expiresAt": "2026-07-25T00:00:00Z",
  "taskProfile": "patchrace-node26-v1",
  "repeat": 1,
  "concurrency": 1,
  "maxWallSeconds": 3600,
  "maxTokens": 98304,
  "maxCostUsd": 10,
  "maxSingleTrialCostUsd": 4,
  "tokenBudgetMode": "post-trial-admission",
  "providerCostCeilingConfirmed": true,
  "environmentNames": [],
  "variants": [
    {
      "id": "pi-approved",
      "adapter": "pi",
      "executable": "pi",
      "provider": "approved-provider",
      "model": "approved-model"
    },
    {
      "id": "claude-approved",
      "adapter": "claude-code",
      "executable": "claude",
      "provider": "approved-provider",
      "model": "approved-model"
    },
    {
      "id": "codex-approved",
      "adapter": "codex",
      "executable": "codex",
      "provider": "approved-provider",
      "model": "approved-model"
    }
  ]
}
```

Run only after reviewing those exact values:

```bash
corepack pnpm qa:live -- \
  --prepared .artifacts/live-e2e/<workspace>/prepared.json \
  --authorization .artifacts/live-e2e/authorization.json \
  --confirm-paid-run
```

Omitting any required field or the final confirmation stops before doctor or
Agent invocation. `tokenBudgetMode: "post-trial-admission"` explicitly
acknowledges that supported CLIs report token usage only after an invocation:
PatchRace stops admission of subsequent trials when the reported aggregate is
exhausted, but cannot interrupt an in-flight provider call at an exact token.
`providerCostCeilingConfirmed: true` attests that the operator configured the
aggregate monetary limit with the providers because Codex and Pi do not expose
an enforceable cost limit in their supported streams. Claude Code additionally
receives `maxSingleTrialCostUsd` as a per-trial `--max-budget-usd` limit. This
single-trial ceiling must be positive and no larger than `maxCostUsd`; it is
kept separate because dividing an aggregate budget equally can stop one Agent
prematurely even when the provider-enforced aggregate still has capacity.

The runner executes all three variants through the same PatchRace race,
deterministic public verifiers, report, and cleanup preview. It writes `PASS`
only when every authorized trial exists, the execution completed without
budget exhaustion, all deterministic gates passed, integrity is valid, and
the observed token/cost totals stay within authorization. A partial,
budget-exhausted, unavailable-token, or failed-gate run retains durable local
evidence but cannot produce passing parity evidence. Raw evidence stays
local-sensitive and is never uploaded automatically.

The task intentionally requires `engines.node` edits in every public package,
so its broad manifest-change assertion is enabled. A separate public verifier
compares the dependency fields in every package manifest with the frozen
baseline commit, while the diff gate independently forbids lockfile changes.
Engine metadata can therefore change without accidentally permitting
dependency-graph drift.
