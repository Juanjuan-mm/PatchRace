# Platform Support Matrix

Status: stable v0.1 release policy
Last updated: 2026-07-24

## Supported baseline

Every combination in this table is release-gated:

| Operating system | Architecture | Runtime | Git |
|---|---|---|---|
| macOS 15 or newer | Apple silicon (`arm64`) | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |
| macOS 15 or newer | Intel (`x64`) | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |
| Ubuntu 22.04 LTS | `x64` | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |
| Ubuntu 24.04 LTS | `x64` | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |
| Ubuntu 24.04 LTS | `arm64` | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |
| Windows 11 / Server 2025 | `x64` | Node `22.22.0+`, `24.x`, or `26.x` | `2.39.0+` |

That is an 18-cell cross product. The workflow uses explicit
`ubuntu-22.04`, `ubuntu-24.04`, `ubuntu-24.04-arm`, `macos-15`,
`macos-15-intel`, and `windows-2025` GitHub-hosted runner labels rather than
floating `*-latest` aliases. Node 22 is Maintenance LTS, Node 24 is Active LTS,
and Node 26 is Current as of this release; Node 20, 23, and 25 are EOL.

Ordinary users install with npm. The pinned Corepack `0.35.0` and pnpm
`11.4.0` toolchain applies only to source development and release
verification.

## Per-cell acceptance

Every one of the 18 cells must complete the same sequence:

1. install pinned Corepack and select integrity-pinned pnpm;
2. install the committed dependency graph with a frozen lockfile;
3. run formatting, lint, strict type checking, deterministic tests, fixtures,
   schema generation, and compiled CLI smoke;
4. dry-pack and inspect all nine public packages;
5. install those tarballs as a clean npm consumer with lifecycle scripts
   disabled;
6. run init → doctor → two-variant race → report → diagnose → cleanup
   preview/confirmation;
7. prove the primary worktree and unrelated state remain unchanged.

`pnpm qa:platform` reproduces the cell in an isolated clean source copy. CI
uses `pnpm qa:platform -- --installed-workspace` after its fresh checkout and
frozen install. Each cell emits a machine-readable environment/check summary
under `.artifacts/qa-platform/`.

Windows uses an explicit executable plus argument prefix for script-backed test
CLIs. The Pi extension validates an npm-installed `patchrace.cmd` against the
adjacent `patchrace` package manifest and launches its JavaScript entry with
Node, without evaluating the command shim or user arguments in a shell.
Timed-out Windows Agent processes are terminated through the exact child PID
tree; Unix hosts use a dedicated process group. The same descendant,
unrelated-process, Git-path, newline, and no-follow ownership regressions run
on every platform.

## Evidence boundary

The public [CI workflow](https://github.com/Juanjuan-mm/PatchRace/actions/workflows/ci.yml)
is the source of truth for the current 18-cell result. A stable tag may be sent
to the protected release workflow only after this matrix is green at that
exact commit. Hosted evidence is point-in-time: runner images, Node, Git, npm,
and vendor CLIs can drift and require fresh execution.

The matrix establishes supported PatchRace mechanics, package installation,
and deterministic fixture behavior. It does not establish that every
repository command or third-party Agent CLI behaves identically across hosts.

## Explicit limitations

- Windows on Arm, macOS older than 15, Linux distributions other than the
  listed Ubuntu LTS releases, WSL, containers, alternative JavaScript
  runtimes, and Node 27+ are not release-gated.
- Task `shellKind` remains explicit. POSIX shell tasks do not become
  PowerShell-compatible merely because PatchRace itself runs on Windows.
- Worktree isolation does not sandbox filesystem, process, credential, or
  network authority.
- PatchRace does not install or authenticate Pi, Claude Code, or Codex.
- Unusual case-folding filesystems, network mounts, low disk space, and
  restrictive enterprise process controls may need additional validation.

An unsupported platform may work on a best-effort basis. A supported-cell
failure should include only its public-safe environment summary, failing
command, PatchRace version, and package/source path; never attach credentials
or raw private Agent traces.
