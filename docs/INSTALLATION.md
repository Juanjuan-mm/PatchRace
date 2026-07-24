# Installation and Quickstart

Status: stable `v0.1.0` registry installation
Last verified: 2026-07-24

Ordinary users install the audited npm release. They do not need a PatchRace
source checkout, Corepack, pnpm, TypeScript, or a local build.

## Prerequisites

- a release-gated macOS, Ubuntu, or Windows environment from
  [PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md);
- Node `22.22.0+`, Node `24.x`, or Node `26.x`;
- Git `2.39.0+`;
- registry access for installation.

Git remains a runtime requirement because PatchRace resolves exact commits and
creates isolated Git worktrees. Node is the supported runtime for the npm CLI.

## Install from npm

For a one-off invocation:

```bash
npx --yes patchrace@0.1.0 --version
npx --yes patchrace@0.1.0 --help
```

For regular use:

```bash
npm install --global patchrace@0.1.0
patchrace --version
patchrace --help
```

The expected version is exactly `0.1.0`. The package has no install lifecycle
script. Its release workflow dry-packs and audits all nine packages, publishes
the exact audited tarballs with provenance, downloads the registry bytes,
compares their hashes, and performs a clean registry install before creating
the GitHub release.

To inspect registry identity:

```bash
npm view patchrace@0.1.0 name version license repository dist.integrity
```

The repository must be `https://github.com/songjinmiao/PatchRace.git`, the
license must be `Apache-2.0`, and `dist.integrity` must be present. Do not
continue if the registry identity differs.

## Pi package

Install the Pi integration only in a trusted project:

```bash
pi install npm:pi-patchrace@0.1.0
```

The extension delegates to the installed `patchrace` executable and never
starts a second Pi session. Project trust, race confirmation, candidate review,
promotion, and rollback remain explicit.

## Provider-free installation check

The following contacts no Agent or model provider and consumes no API quota:

```bash
patchrace --version
patchrace --help
patchrace init
```

`init` writes a review-required `.patchrace/suite.yaml` and task skeleton. It
does not execute repository commands or invoke an Agent. Review the generated
files before changing `project.trustRepositoryCommands`.

Maintainers can run the deeper deterministic quickstart from a source checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm docs:quickstart
```

It creates a temporary Git repository and local Pi-shaped fixture, then runs:

```text
init → doctor → two-variant race → report → diagnose
     → cleanup preview → cleanup confirmation
```

The retained local-sensitive report is written under:

```text
.artifacts/quickstart/<run-id>/report.json
.artifacts/quickstart/<run-id>/index.html
```

This maintainer check does not contact Pi, Claude, Codex, a model provider, a
credential store, or a PatchRace service. It performs no telemetry,
publication, commit, push, or global Pi mutation.

## Moving to a real repository

Use PatchRace only for a repository and commands you trust. Git worktrees
isolate repository state; they are not a filesystem, process, credential, or
network sandbox.

1. Enter the target Git repository and run `patchrace init`.
2. Review `.patchrace/suite.yaml`, every task, setup/verifier command, and
   referenced asset.
3. Configure explicit Agent executables, versions, models, repetitions,
   concurrency, and wall/trial/token/cost/disk budgets.
4. Keep `project.trustRepositoryCommands: false` until that review is complete.
5. Run `patchrace doctor`; use each vendor's official login flow to resolve
   missing authentication. PatchRace never extracts credentials.
6. Start with a small validation race, retain its raw local evidence, and use a
   separately previewed and confirmed redacted export before sharing anything.

Live provider execution is intentionally absent from automated CI. The
maintained three-Adapter parity profile requires an expiring authorization that
names every provider, model, task, and aggregate budget. See
[LIVE_E2E.md](LIVE_E2E.md).

## Source development

Contributors, not ordinary npm users, need Corepack and the pinned pnpm:

```bash
git clone https://github.com/songjinmiao/PatchRace.git
cd PatchRace
npm install --global corepack@0.35.0
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

The repository pins pnpm `10.34.5` with integrity. Do not rewrite
`packageManager`, bypass the frozen lockfile, or enable dependency lifecycle
scripts to repair an install.

## Troubleshooting

| Symptom | Action |
|---|---|
| npm reports an engine error | Install a patched Node 22.22+, 24, or 26 release. Node 20/23/25 are EOL. |
| `patchrace` is not found after global install | Inspect npm's global bin directory or use `npx --yes patchrace@0.1.0`. |
| Git/worktree doctor check fails | Install Git 2.39+ and resolve `git worktree list` in the repository. |
| Agent doctor check is unavailable | Follow the executable/version/auth remediation without copying or printing credentials. |
| Race refuses repository trust | Review the suite commands, then set the documented trust field explicitly; do not bypass the gate. |
| A report should be shared | Do not share the complete local report. Preview, confirm, and manually review a redacted export. |
| Cleanup is ambiguous | Retain the run and inspect the dry-run plan. Never delete broad roots or unrecorded paths. |
