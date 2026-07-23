# Realistic Deterministic Examples

Last updated: 2026-07-23

PatchRace includes three small, public-safe repositories that exercise real
language/tool commands without contacting an Agent provider:

| Example | Task | Deterministic verifier |
|---|---|---|
| [TypeScript](../examples/realistic/typescript/README.md) | Parse numeric and HTTP-date `Retry-After` values with correct rounding/clamping. | Node's test runner imports a typed `.ts` module through Node 22 type stripping. |
| [Python](../examples/realistic/python/README.md) | Aggregate CSV invoice totals with exact decimal/business validation and stable ordering. | Python standard-library `unittest`; no installed package or network. |
| [POSIX shell](../examples/realistic/shell/README.md) | Select failed TSV test rows without whitespace corruption or shell evaluation. | `/bin/sh` plus standard `awk`, including malformed-input rejection. |

Run them from a prepared source checkout:

```bash
corepack pnpm examples:verify
```

The command builds PatchRace, creates three temporary Git repositories from the
checked baselines, and races two synthetic Pi-compatible harnesses per task:

- `fixture-no-change` makes no patch and fails the deterministic test hard gate;
- `fixture-reviewed-fix` applies the public reviewed solution and passes every
  hard gate.

Each race stores a complete local-sensitive JSON/HTML report under
`.artifacts/examples/<example-id>/`, verifies correctness-first ranking,
previews and confirms exact owned-run cleanup, and proves that the primary
worktree and an unrelated sentinel remain unchanged. The summary is
`.artifacts/examples/summary.json`.

These are harness comparisons, not model comparisons. The executables and
solutions are synthetic and public. They prove task loading, worktree
isolation, Agent-shaped invocation, raw evidence, deterministic grading,
correctness-first ranking, reports, and cleanup for the recorded examples.
They do not prove live Pi, Claude Code, or Codex quality, vendor compatibility,
generalization, hidden-verifier secrecy, or safe execution of an untrusted
repository.

## Teaching and final holdout

The same command runs the checked 12-task Pi package-manager guidance case from
`fixtures/m8/heldout-demo.json`:

```text
8 training tasks
  → evidence-linked context diagnosis
  → one project-guidance mutation
  → 2 validation tasks
  → frozen candidate and correctness-first policy
  → one-time 2-task final holdout
  → promote-eligible
```

Proposal bytes expose only the holdout count/commitment, not final task IDs.
Validation improves the fixture success rate from 0 to 1. The frozen final
holdout repeats that improvement, passes integrity/correctness/safety/protected
path gates and every predeclared budget, then records
`retuneAllowed: false`. Promotion remains a recommendation; the example does
not write active Pi configuration.

This teaching case proves the split, candidate, validation, one-time holdout,
decision, and no-retune mechanics for deterministic public fixture evidence. It
is not a live Pi model benchmark or evidence that the guidance improves
arbitrary repositories.

## Requirements and safety

- Node `>=22.22.0 <25`, Git, Corepack/pnpm, Python 3, and standard POSIX
  `/bin/sh`/`awk`.
- No provider, credential store, Keychain, telemetry, upload, package install,
  network access, paid call, publication, commit to the user's repository,
  push, or global Pi mutation.
- Fixture repositories execute code on the host and are not a sandbox. Read
  their short source and verifier files before running.
- Generated reports are local-sensitive. Do not publish them; use only the
  separate previewed, confirmed shareable export and review every result.
