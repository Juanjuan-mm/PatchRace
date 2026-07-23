# PatchRace

[![CI](https://github.com/songjinmiao/PatchRace/actions/workflows/ci.yml/badge.svg)](https://github.com/songjinmiao/PatchRace/actions/workflows/ci.yml)
[![Supply chain](https://github.com/songjinmiao/PatchRace/actions/workflows/supply-chain.yml/badge.svg)](https://github.com/songjinmiao/PatchRace/actions/workflows/supply-chain.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> Race coding agents. Distill what wins. Make Pi better.

PatchRace is a local-first, open-source system for running Pi, Claude Code, and
Codex on reproducible repository tasks. It grades deterministic correctness
before speed or cost, preserves inspectable evidence, diagnoses observable
workflow differences, and stages project-local Pi improvements for explicit
review and held-out validation.

## Preview status

The current version is `v0.1.0-rc.1`, a source-only GitHub preview. It is not
published to npm and is not a stable or beta-validated release.

The implementation has passed deterministic local dogfood, platform,
compatibility, chaos, performance, security, privacy, documentation, and
package-content gates. Independent-user beta remains **0/5**. The owner
explicitly chose to publish the preview first and test it personally; this is a
known evidence gap, not a claimed pass.

Do not use PatchRace on a repository whose commands you do not trust.
Worktrees isolate Git state; they do not sandbox filesystem, process,
credential, or network access.

## What it does

```text
repository tasks
      │
      ▼
Pi ─ Claude Code ─ Codex
      │
      ▼
deterministic grading → comparison report → evidence-linked diagnosis
                                            │
                                            ▼
                                 reviewable Pi candidate
                                            │
                                            ▼
                           validation → final holdout → promote/reject
```

- Runs repeated, budgeted trials from exact commits in separate Git worktrees.
- Keeps vendor-specific invocation inside tested adapters and records raw bytes
  before normalization.
- Applies setup, tests, hidden verifiers, and assertions before any optional
  subjective judgment.
- Produces durable JSON plus standalone HTML, JUnit, and SARIF presentations.
- Explains findings using observable commands, edits, tests, files, and tool
  events—never reconstructed hidden chain of thought.
- Stages Markdown guidance, Skills, or prompt candidates locally; review,
  validation, promotion, and rollback remain separate explicit actions.
- Stores data locally by default and performs no PatchRace telemetry or
  automatic artifact upload.

## Try it without an Agent account

Prerequisites:

- macOS 15+ on Apple silicon, or Ubuntu 24.04 on arm64/x64;
- Node `22.22.0+` on the Node 22 line, or Node 24;
- Git `2.39.0+`;
- Corepack with the repository-pinned pnpm `10.34.5`.

From a source checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm docs:quickstart
```

The quickstart builds PatchRace, creates a temporary repository, and completes:

```text
init → doctor → two-variant race → report → diagnose
     → cleanup preview → cleanup confirmation
```

It uses deterministic local fixture adapters, spends no model/API quota, and
retains an inspectable report under `.artifacts/quickstart/`. The command
neither reads vendor credentials nor changes global Pi configuration.

Run the development CLI directly:

```bash
corepack pnpm build
node packages/cli/dist/main.js --version
node packages/cli/dist/main.js --help
```

See the [installation and five-minute quickstart](docs/INSTALLATION.md) before
using a real repository.

## Use it on a real repository

PatchRace deliberately refuses to infer trust or authentication readiness.

1. Run `patchrace init` and review the generated suite and task files.
2. Review every repository setup/verifier command before enabling repository
   command trust.
3. Configure explicit Agent executables, model identifiers, repetitions,
   concurrency, and wall/trial/token/cost/disk budgets.
4. Run `patchrace doctor`; fix unsupported or auth-unready tools through each
   vendor's normal login flow.
5. Start with a small `patchrace race`, inspect the raw local evidence and
   report, then diagnose or teach only after the comparison is valid.
6. Preview cleanup and exports before separately confirming them.

PatchRace never enumerates or copies vendor credentials. Agent CLIs still run
with your host authority and may send repository material according to their
own configuration and terms.

## Evidence and limits

The release candidate currently has:

- 55 deterministic CLI dogfood runs across 10 tasks and all three adapters;
- 50 expected passes and 5 classified Agent failures;
- 10 interruption/cleanup scenarios with no orphaned owned worktrees;
- 75 test files and 245 tests after the release-version regression;
- clean macOS and Ubuntu arm64/x64 evidence on Node 22 and 24;
- three public-safe realistic examples: TypeScript, Python, and POSIX shell;
- 18/18 correct high-confidence diagnoses on the maintained 21-case set;
- no known unresolved critical/high security or privacy finding.

This evidence validates the local mechanics and maintained fixtures. It does
not establish universal Agent superiority, live-model quality, provider cost,
complete secret redaction, host sandboxing, independent usability, or a
transferable Pi improvement across arbitrary repositories.

## Documentation

- [Installation and quickstart](docs/INSTALLATION.md)
- [Concepts and methodology](docs/CONCEPTS_AND_METHODOLOGY.md)
- [Realistic examples](docs/REALISTIC_EXAMPLES.md)
- [Security, privacy, and cleanup](docs/SECURITY_PRIVACY_AND_CLEANUP.md)
- [Supported platforms](docs/PLATFORM_SUPPORT.md)
- [Agent compatibility](docs/QA_AGENT_COMPATIBILITY.md)
- [System architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Contributing an adapter](docs/CONTRIBUTING_ADAPTERS.md)
- [Contributing a grader](docs/CONTRIBUTING_GRADERS.md)
- [Project status and evidence](docs/PROGRESS.md)
- [Release-candidate review](docs/M10_RELEASE_CANDIDATE.md)

The complete decision, risk, task, threat, and historical evidence records are
kept under [`docs/`](docs/).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Commits
use DCO 1.1 sign-off, and substantial coding-agent assistance should be
disclosed with the human verification performed.

Do not post credentials, private source, raw traces, or unpatched exploit
details in a public issue. Follow [SECURITY.md](SECURITY.md) for confidential
reporting.

PatchRace is licensed under [Apache-2.0](LICENSE).
