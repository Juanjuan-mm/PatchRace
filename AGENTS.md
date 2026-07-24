# AGENTS.md

Guidance for coding agents contributing to PatchRace.

## Product boundaries

- PatchRace is Pi-native, not Pi-only.
- Deterministic correctness gates run before optional judgment.
- Use observable traces and artifacts; never request or reconstruct hidden
  chain of thought.
- Operation is local-first with no automatic telemetry or artifact upload.
- Pi workflow candidates remain project-local, reviewable, and explicitly
  promoted.
- Git worktrees isolate repository state; they are not a host sandbox.

## Architecture

Follow the package dependency direction documented in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md):

```text
contracts
├─ core ─┬─ adapters
│        ├─ tasks
│        ├─ cli
│        └─ pi-extension
├─ diagnosis ─ optimizer
└─ report
```

- Shared public schemas belong in `@patchrace/contracts`.
- Durable execution behavior belongs in `@patchrace/core`.
- Vendor-specific invocation and parsing belong in `@patchrace/adapters`.
- The CLI owns argument parsing, presentation routing, and exit-code mapping,
  not durable business state.
- Presenters consume durable artifacts and are never the source of truth.
- Do not edit generated `dist/`, `*.tsbuildinfo`, or generated schemas by hand.

## Correctness and safety

1. Record exact task, base commit, configuration, adapter, model, and version
   provenance.
2. Preserve completed raw evidence; mutable coordinator state is not enough.
3. Represent unavailable usage, cost, capabilities, and events as unavailable,
   never as inferred zero.
4. Keep model, harness, and Pi-resource changes as independent dimensions.
5. Record paid retries as explicit attempts with lineage.
6. Keep hidden verifiers and final holdout material unavailable to agents.
7. Human-readable output goes to stderr; requested machine output is stable
   JSON on stdout.
8. Inject time, IDs, versions, and paths in tests.

Never enumerate, copy, log, or persist vendor credentials. Real provider calls
require explicit authorization for the provider, model, task, and budget.
Repository and verifier commands are executable user input; use explicit
executable/argument arrays and narrow environment allowlists.

Cleanup may target only validated PatchRace-owned descendants of the selected
run root. Support dry-run, revalidate ownership at execution time, and preserve
unrelated branches, worktrees, files, configuration, and raw evidence.

## Development workflow

- Preserve unrelated work in a dirty tree.
- Add a regression test for every bug fix.
- Keep unit tests beside source as `*.test.ts`; use deterministic fixtures for
  cross-package and lifecycle behavior.
- Add a Changeset for user-visible behavior in publishable packages.
- New runtime dependencies require an exact version and documented review.
- Update public documentation when behavior, schemas, CLI output, compatibility,
  safety guarantees, or workflows change.

Use the narrowest useful checks while iterating, then run:

```bash
pnpm check
pnpm qa:public
```

For package or release changes also run:

```bash
pnpm release:pack
pnpm qa:security
pnpm qa:privacy
```

Before handoff, inspect the diff for unrelated edits, generated-file mistakes,
credentials, personal paths, private traces, and unsupported public claims.
