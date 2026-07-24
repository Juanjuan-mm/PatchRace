# Installation and Five-Minute Quickstart

Status: source-install instructions for the `v0.1.0-rc.2` GitHub preview
Last verified: 2026-07-23

PatchRace `v0.1.0-rc.2` is a source-only GitHub preview. It is not published to
npm; do not substitute an unrelated registry package named `patchrace`. The
quickstart is provider-free and spends no Agent/API quota.

## Prerequisites

- macOS 15+ on Apple silicon, or Ubuntu 24.04 on arm64/x64;
- Node `22.22.0+` (but below 23) or Node `24.x`;
- Git `2.39.0+`;
- network access for the first frozen dependency install;
- about 1 GiB of free disk for the development toolchain.

Windows, WSL, Node 20/23/25/26, other Linux distributions, and other
architectures are not release-gated for v0.1. See
[PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md) for the executed matrix.

Check the tools:

```bash
node --version
git --version
corepack pnpm --version
```

The repository pins pnpm `10.34.5` with integrity. Corepack should select that
version from `packageManager`; if the printed version differs, stop rather than
generating a different lock state.

## Install from a source checkout

From the PatchRace repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm check
```

The install uses the committed lockfile, rejects engine/peer drift, verifies the
package store, and does not admit dependency lifecycle scripts. `pnpm check`
runs formatting, lint, strict TypeScript, tests, fixtures, build/schema
generation, and the provider-free compiled CLI smoke.

The development CLI entry is:

```bash
node packages/cli/dist/main.js --help
```

No global install is required. `npm install -g patchrace` is not a supported
preview instruction and becomes one only after a separately verified registry
publication.

## Five-minute provider-free quickstart

Run:

```bash
corepack pnpm docs:quickstart
```

The command builds PatchRace, creates a temporary fresh Git repository, and
uses a deterministic local Pi-shaped fixture executable. It then performs:

```text
init → doctor → two-variant race → report → diagnose
     → cleanup preview → cleanup confirmation
```

Both trials must pass deterministic tests. The temporary primary worktree and
an unrelated sentinel must remain unchanged, all owned trial worktrees and raw
run state are cleaned exactly, and a report copy is retained under:

```text
.artifacts/quickstart/<run-id>/report.json
.artifacts/quickstart/<run-id>/index.html
```

The final JSON summary prints the exact relative paths. Inspect `report.json`
for two `outcome: "passed"` trials and open `index.html` with a local browser if
desired. These are complete local-sensitive reports, not redacted public
exports. `.artifacts/` is Git-ignored.

This prepared example executes local fixture code and Git/test commands, but it
does not contact Pi, Claude, Codex, a model provider, a credential store, or a
PatchRace service. It performs no telemetry, publication, package install,
commit to your repository, push, or global Pi mutation.

On a maintained reference machine, a new source copy with no `node_modules` or
built output completed in 6.742 seconds: frozen dependency installation took
0.687 seconds and the quickstart took 5.901 seconds. That is one reference
measurement, not a universal performance promise. The verifier records install
and first-valid-comparison time separately so a warm workspace is not disguised
as a clean install.

## What the quickstart proves

- the compiled CLI can initialize configuration without invoking an Agent;
- `doctor` verifies the selected executable instead of trusting PATH presence;
- two frozen variants run in separate exact-commit worktrees;
- deterministic setup, verifier, assertions, ranking, report, and diagnosis
  consume durable evidence;
- machine output stays JSON on stdout and human output stays on stderr;
- cleanup is preview-first, confirmed, exact-target, and preserves unrelated
  state.

It does not prove live Agent quality, current vendor authentication, provider
cost, host sandboxing, public redaction completeness, beta usability, or npm
publication.

## Moving to a real repository

Do this only for a repository and commands you trust. PatchRace worktrees
isolate Git state; they do not sandbox filesystem, process, credential, or
network access.

1. Build or install a verified PatchRace release and enter the repository.
2. Run `patchrace init` (or the development entry above) and review the generated
   `.patchrace/suite.yaml` and task files.
3. Keep `project.trustRepositoryCommands: false` until every setup/verifier
   command and referenced asset is reviewed.
4. Configure one supported Agent executable, explicit versions/models, bounded
   concurrency/repetitions, and wall/trial/token/cost/disk budgets.
5. Run `doctor` before `race`; fix missing/unsupported/auth-unready results
   through the vendor's normal CLI flow. PatchRace never extracts tokens.
6. Set repository-command trust only when ready, run a small validation suite,
   inspect raw local evidence, and use the separate preview/confirmed redacted
   export before any publication.

Live provider use is not part of this quickstart. Start with an exact task,
endpoint/model, and strict token, cost, time, concurrency, and disk budgets.
See [LIVE_E2E.md](LIVE_E2E.md) for one bounded reference run.

## Local package install for maintainers

The local package path is useful for maintainer release testing, not end-user
installation:

```bash
corepack pnpm qa:release
node scripts/run-qa-smoke.mjs --packed --network-install
```

It builds and audits all nine local tarballs, installs them into an isolated
temporary npm consumer with scripts disabled, runs the same flow, and removes
the temporary consumer. It does not publish.

## Troubleshooting

| Symptom | Action |
|---|---|
| Node engine error | Use the latest patched Node 22 LTS or Node 24 LTS in the documented range. |
| pnpm version differs | Use Corepack from the repository root; do not rewrite `packageManager` or the lockfile. |
| Frozen install fails | Confirm network/registry access and an unchanged `pnpm-lock.yaml`; do not use `--no-frozen-lockfile`. |
| `packages/cli/dist/main.js` is missing | Run `corepack pnpm build` and fix the first TypeScript/schema error. |
| `doctor` reports unavailable | Follow its executable/version/auth remediation; do not copy or print credentials. |
| Race refuses repository trust | Review the suite commands, then explicitly set the documented trust field; do not bypass the gate. |
| Quickstart exceeds five minutes | Record install and quickstart times separately, machine/Node/Git versions, and the first failing phase. |
| Report should be shared | Do not share the local quickstart report. Use the privacy-projected, previewed, confirmed export and review it manually. |

For destructive or ambiguous cleanup failures, retain the exact run and inspect
the dry-run plan. Never delete broad roots, the repository root, user worktrees,
or unrecorded paths to make a test pass.
