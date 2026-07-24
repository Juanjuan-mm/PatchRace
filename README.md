# PatchRace

[![CI](https://github.com/Juanjuan-mm/PatchRace/actions/workflows/ci.yml/badge.svg)](https://github.com/Juanjuan-mm/PatchRace/actions/workflows/ci.yml)
[![Supply chain](https://github.com/Juanjuan-mm/PatchRace/actions/workflows/supply-chain.yml/badge.svg)](https://github.com/Juanjuan-mm/PatchRace/actions/workflows/supply-chain.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> Race coding agents. Distill what wins. Make Pi better.

PatchRace is a local-first, open-source system for running Pi, Claude Code, and
Codex on reproducible repository tasks. It grades deterministic correctness
before speed or cost, preserves inspectable evidence, diagnoses observable
workflow differences, and stages project-local Pi improvements for explicit
review and held-out validation.

## Stable status

The current version is `v0.1.0`, the first stable npm and GitHub release.
Ordinary users can run `npx --yes patchrace@0.1.0` or install the CLI globally;
no source checkout, Corepack, pnpm, TypeScript, or local build is required.

The implementation has passed deterministic local, platform, compatibility,
chaos, performance, security, privacy, documentation, package-content, and
budget-bounded live-provider checks. See [verification](docs/VERIFICATION.md)
for the exact evidence and its limits.

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

- a release-gated macOS 15+, Ubuntu 22.04/24.04, or Windows 11/Server 2025
  environment;
- Node `22.22.0+`, Node 24, or Node 26;
- Git `2.39.0+`;

Install and inspect the exact stable CLI:

```bash
npx --yes patchrace@0.1.0 --version
npx --yes patchrace@0.1.0 --help
```

For regular use:

```bash
npm install --global patchrace@0.1.0
patchrace init
```

`init` is provider-free and writes only a review-required project-local suite.
See the [installation and quickstart](docs/INSTALLATION.md) before using a real
repository.

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

The stable release currently has:

- 55 deterministic CLI dogfood runs across 10 tasks and all three adapters;
- 50 expected passes and 5 classified Agent failures;
- 10 interruption/cleanup scenarios with no orphaned owned worktrees;
- 75 test files and 247 tests;
- an 18-cell macOS arm64/x64, Ubuntu 22.04/24.04 arm64/x64, and Windows x64
  package/CLI matrix on Node 22, 24, and 26;
- three public-safe realistic examples: TypeScript, Python, and POSIX shell;
- 18/18 correct high-confidence diagnoses on the maintained 21-case set;
- a real Pi `0.81.1` + DeepSeek Flash run that passed every deterministic gate
  within a 4,096-token and $0.05 ceiling;
- a fail-closed equal-task live parity harness for Pi, Claude Code, and Codex
  on the public PatchRace TypeScript monorepo;
- no known unresolved critical/high security or privacy finding.

This evidence validates the local mechanics and maintained fixtures. It does
not establish universal Agent superiority, live-model quality, provider cost,
complete secret redaction, host sandboxing, broad independent usability, or a
transferable Pi improvement across arbitrary repositories.

## Documentation

- [Installation and quickstart](docs/INSTALLATION.md)
- [Concepts and methodology](docs/CONCEPTS_AND_METHODOLOGY.md)
- [Realistic examples](docs/REALISTIC_EXAMPLES.md)
- [Security, privacy, and cleanup](docs/SECURITY_PRIVACY_AND_CLEANUP.md)
- [Supported platforms](docs/PLATFORM_SUPPORT.md)
- [Agent adapter contract](docs/architecture/AGENT_ADAPTER.md)
- [System architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Contributing an adapter](docs/CONTRIBUTING_ADAPTERS.md)
- [Contributing a grader](docs/CONTRIBUTING_GRADERS.md)
- [Verification evidence](docs/VERIFICATION.md)
- [Live-provider end-to-end check](docs/LIVE_E2E.md)
- [Release notes](docs/releases/v0.1.0.md)

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Commits
use DCO 1.1 sign-off, and substantial coding-agent assistance should be
disclosed with the human verification performed.

Do not post credentials, private source, raw traces, or unpatched exploit
details in a public issue. Follow [SECURITY.md](SECURITY.md) for confidential
reporting.

PatchRace is licensed under [Apache-2.0](LICENSE).
