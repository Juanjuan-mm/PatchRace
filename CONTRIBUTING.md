# Contributing to PatchRace

PatchRace welcomes focused, evidence-backed contributions. `v0.1.0-rc.1` is a
source-only preview; public contracts may evolve only through the recorded
decision process.

## Set up a clean checkout

Prerequisites are Git, Corepack, and a supported Node.js release (`>=22.22.0 <25`; CI covers Node 22 and 24 on macOS and Linux).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

No Python runtime is required for the product. Python 3 is needed only for the deterministic Python fixture in the complete local M2 gate.

## Development workflow

1. Start from a dependency-ready task in `docs/TASKS.md`; follow `docs/MAINTENANCE.md` when changing canonical records.
2. Keep public wire contracts in `@patchrace/contracts`, business behavior out of the CLI shell, and package imports aligned with the dependency graph.
3. Add named behavioral tests or deterministic fixtures. Inject time, IDs, paths, and versions rather than snapshotting nondeterminism.
4. Run `pnpm check`. Use `pnpm test:coverage` for diagnostic coverage and `pnpm release:pack` for package changes.
5. Add a changeset for user-visible package changes. Do not publish from a local development task.

## Tests and fixtures

- Unit tests live next to source as `*.test.ts` and run in Vitest's Node environment.
- External fixture repositories live under `fixtures/` and deliberately avoid workspace dependencies.
- `pnpm fixtures:verify` covers TypeScript/Python success, task failure, dirty state, hidden verifier injection, timeout, and conflicting patches.
- `pnpm quality:fixtures` proves formatting, lint, type, and test failures are actually rejected.
- Agent adapter contributions follow [the adapter guide](docs/CONTRIBUTING_ADAPTERS.md).
- Deterministic grader contributions follow [the grader guide](docs/CONTRIBUTING_GRADERS.md).

## Commits, reviews, and releases

Every contributed commit must include a DCO 1.1 `Signed-off-by` trailer (`git commit -s`). Substantial coding-agent assistance must be disclosed in the pull request with the checks a human ran. Ordinary changes require normal review; security, authentication, cleanup, artifact-format, and release changes receive heightened review under `docs/GOVERNANCE.md`.

Changesets version packages and generate package changelogs. Maintainers inspect
the tarballs from `pnpm release:pack`. The GitHub preview does not publish npm
packages; any later registry publication uses a separately protected and
verified workflow.

## Security and privacy

Never commit credentials, raw agent traces, local run artifacts, or absolute
personal paths. Worktrees are isolation, not a sandbox. Report suspected
vulnerabilities through the private process in [SECURITY.md](SECURITY.md);
never post credential material or unpatched exploit details in a public issue.
