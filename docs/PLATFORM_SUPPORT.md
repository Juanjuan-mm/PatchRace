# Platform Support Matrix

Status: current v0.1 support policy
Last updated: 2026-07-23

## Supported v0.1 baseline

PatchRace supports these release-gated environments:

| Operating system | Architecture | Runtime | Git | Package install |
|---|---|---|---|---|
| macOS 15 or newer | Apple silicon (`arm64`) | Node `22.22.0+` or Node `24.x` | `2.39.0+` | npm for released packages; pinned pnpm `10.34.5` for a source checkout |
| Ubuntu 24.04 LTS | `x64` | Node `22.22.0+` or Node `24.x` | `2.39.0+` | npm for released packages; pinned pnpm `10.34.5` for a source checkout |
| Ubuntu 24.04 LTS | `arm64` | Node `22.22.0+` or Node `24.x` | `2.39.0+` | npm for released packages; pinned pnpm `10.34.5` for a source checkout |

The release matrix uses explicit `macos-15` and `ubuntu-24.04` GitHub-hosted
runner labels rather than floating `*-latest` labels. GitHub documents both
labels in its
[runner image inventory](https://github.com/actions/runner-images#available-images).
The matrix installs exact Node lines through `actions/setup-node`, so the
runner's preinstalled default Node version is not evidence.

## Per-cell acceptance

Every supported OS/Node cell must complete the same sequence:

1. install the committed dependency graph with
   `pnpm install --frozen-lockfile`;
2. run `pnpm check`;
3. dry-pack and inspect all nine public packages;
4. install those tarballs as a clean consumer with lifecycle scripts disabled;
5. run the compiled CLI through init → doctor → two-variant race → report →
   diagnose → cleanup preview/confirm;
6. prove the primary worktree and unrelated state remain unchanged.

`pnpm qa:platform` reproduces the sequence in an isolated clean source copy.
CI uses `pnpm qa:platform -- --installed-workspace` after its fresh checkout
and frozen install. Each passing cell emits a machine-readable environment and
check summary under `.artifacts/qa-platform/`.

## Evidence

The checked source has passed the supported macOS and Ubuntu, arm64 and x64,
Node 22 and 24 combinations. The public
[CI workflow](https://github.com/songjinmiao/PatchRace/actions/workflows/ci.yml)
repeats the GitHub-hosted macOS arm64 and Ubuntu x64 cells on every main-branch
push and pull request. Hosted evidence is point-in-time; runtime, image,
dependency, or vendor drift requires fresh CI.

## Explicit limitations

- Windows, macOS Intel, Linux distributions other than Ubuntu 24.04, Node 20,
  Node 26, alternative JavaScript runtimes, WSL, and container-specific
  behavior are not release-gated for v0.1.
- Worktree isolation does not sandbox the filesystem, processes, credentials,
  or network. Repository setup, verifier, and Agent commands execute with the
  invoking user's host authority.
- PatchRace does not install or authenticate Pi, Claude Code, or Codex. Their
  executable/version/auth readiness is checked separately by `doctor`.
- A clean package install requires registry access for public runtime
  dependencies. PatchRace itself performs no telemetry or artifact upload.
- Git filesystems with unusual case folding, network mounts, low disk space,
  or restrictive enterprise process controls may need additional validation.

## Troubleshooting boundary

An unsupported platform may work, but failures there are best effort until its
OS/architecture/runtime combination is added to this matrix with the full
sequence above. A supported-cell failure must include the emitted environment
summary, failing command, PatchRace version, and whether the source checkout or
packed-consumer path failed; credentials and raw private traces must not be
attached.
