# Platform Support and QA Matrix

Status: `QA-02` working record  
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

| Environment | Source | Result |
|---|---|---|
| macOS 26.3, Apple silicon, Node 22.22.1, Git 2.50.1, pnpm 10.34.5 | Local isolated clean copy | PASS |
| macOS 26.3, Apple silicon, Node 24.18.0, Git 2.50.1, pnpm 10.34.5 | Local isolated clean copy | PASS |
| Ubuntu 24.04, Linux 6.8.0-106, arm64, Node 22.22.1, Git 2.43.0, pnpm 10.34.5 | Local VZ guest, fresh installed workspace | PASS |
| Ubuntu 24.04, Linux 6.8.0-106, arm64, Node 24.18.0, Git 2.43.0, pnpm 10.34.5 | Local VZ guest, fresh installed workspace | PASS |
| Ubuntu 24.04, Linux 6.8.0-106, x64, Node 22.22.1, Git 2.43.0, pnpm 10.34.5 | Local QEMU x86_64 guest, fresh installed workspace | PASS |
| Ubuntu 24.04, Linux 6.8.0-106, x64, Node 24.18.0, Git 2.43.0, pnpm 10.34.5 | Local QEMU x86_64 guest, fresh installed workspace | PASS |
| macOS 15, Apple silicon, Node 22.22.0 | GitHub Actions `macos-15` | Requires first repository-backed CI run |
| macOS 15, Apple silicon, Node 24.x | GitHub Actions `macos-15` | Requires first repository-backed CI run |
| Ubuntu 24.04, x64, Node 22.22.0 | GitHub Actions `ubuntu-24.04` | Requires first repository-backed CI run |
| Ubuntu 24.04, x64, Node 24.x | GitHub Actions `ubuntu-24.04` | Requires first repository-backed CI run |

The local Linux cells used checksum-verified official Ubuntu 24.04 cloud images
and official Node tarballs. The x64 cells booted an actual x86_64 kernel and
userland under QEMU TCG; they were not arm64 results relabeled as x64. QEMU and
Lima are QA infrastructure only and are not PatchRace runtime requirements.

Configured hosted CI cells are not counted as hosted evidence until a real run
exists. The repository currently has no commit or remote, so no GitHub Actions
result is claimed. The same commands nevertheless passed in fresh local
macOS/Linux environments for both supported Node lines.

## Explicit limitations

- Windows, macOS Intel, Linux distributions other than Ubuntu 24.04, Node 20,
  Node 26, alternative JavaScript runtimes, WSL, and container-specific
  behavior are not release-gated for v0.1.
- Worktree isolation does not sandbox the filesystem, processes, credentials,
  or network. Repository setup, verifier, and Agent commands execute with the
  invoking user's host authority.
- PatchRace does not install or authenticate Pi, Claude Code, or Codex. Their
  executable compatibility is a separate `QA-04` gate.
- A clean package install requires registry access for public runtime
  dependencies. PatchRace itself performs no telemetry or artifact upload.
- Git filesystems with unusual case folding, network mounts, low disk space,
  or restrictive enterprise process controls may need additional validation;
  chaos and resource limits are handled by `QA-03` and `QA-05`.

## Troubleshooting boundary

An unsupported platform may work, but failures there are best effort until its
OS/architecture/runtime combination is added to this matrix with the full
sequence above. A supported-cell failure must include the emitted environment
summary, failing command, PatchRace version, and whether the source checkout or
packed-consumer path failed; credentials and raw private traces must not be
attached.
