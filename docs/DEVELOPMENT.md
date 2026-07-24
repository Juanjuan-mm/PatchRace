# Development Guide

Last updated: 2026-07-22

## Supported environment

PatchRace uses strict ESM TypeScript 6 and pnpm 10 on Node 22/24 LTS and Node
26 Current. The root `packageManager` field pins pnpm with registry integrity,
`.node-version` selects the minimum development line, and CI exercises all
three supported Node lines across explicit macOS arm64/x64, Ubuntu arm64/x64,
and Windows x64 runners. The executed 18-cell matrix and limitations are
recorded in [PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md).

## Commands

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | Reproduce the committed dependency graph. |
| `pnpm check` | Run formatting, lint, typecheck, unit tests, fixture verification, intentional quality failures, and build. |
| `pnpm docs:quickstart` | Build and run the provider-free five-minute quickstart, retaining a local-sensitive report under `.artifacts/quickstart/`. |
| `pnpm docs:quickstart:verify` | Reproduce the documented quickstart from a fresh source copy and record separated installation/activation timing. |
| `pnpm test:coverage` | Produce diagnostic V8 coverage under `.artifacts/coverage`. |
| `pnpm release:status` | Inspect pending Changesets without mutating versions. |
| `pnpm release:pack` | Build and pack every public workspace package into `.artifacts/packages` without publishing. |
| `pnpm supply-chain:audit` | Fail on high/critical known advisories (requires registry access). |
| `pnpm supply-chain:licenses` | Generate and validate the production license inventory. |

Human CLI progress and diagnostics go to stderr. Requested `--json` output is
one stable JSON value on stdout. Argument parsing and exit-code mapping stay in
the CLI; durable business behavior stays in the package services.

## Package graph

```text
contracts
├─ core ─┬─ adapters
│        ├─ tasks
│        ├─ cli
│        └─ pi-extension
├─ diagnosis ─ optimizer
└─ report
```

TypeScript project references enforce the build order. Packages publish compiled ESM, declarations, source maps, and their package README only. Fixtures, repository docs, local state, credentials, and raw runs are excluded.

## Version and dependency policy

Use exact versions for tooling and direct runtime dependencies. Internal dependencies use `workspace:^` and are rewritten during packing. New runtime dependencies require the admission review in `docs/architecture/STACK_AND_DEPENDENCIES.md`. The lockfile is committed; CI uses frozen installation. Dependency updates are reviewable Dependabot pull requests and are never auto-merged.
