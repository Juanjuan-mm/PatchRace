# @patchrace/core

## 0.1.0

### Patch Changes

- Graduate PatchRace to its first registry-ready stable release: add protected
  npm/GitHub publication with audited tarball verification, support Node 26 and
  the release-gated Windows/macOS Intel/Ubuntu 22 platform lanes, and allow an
  explicit executable argument prefix for portable script-backed Agent CLIs.
- Updated dependencies
  - @patchrace/contracts@0.1.0

## 0.1.0-rc.2

### Patch Changes

- @patchrace/contracts@0.1.0-rc.2

## 0.1.0-rc.1

### Patch Changes

- @patchrace/contracts@0.1.0-rc.1

## 0.1.0-rc.0

### Minor Changes

- Add the reproducible execution core: versioned suite contracts and loading, durable run artifacts, safe worktrees and process groups, bounded scheduling, interruption recovery, redacted exports, environment inspection, and explicit cleanup.
- Establish the initial PatchRace development foundation: strict ESM TypeScript workspaces, stable CLI and error conventions, structured redacted diagnostics, deterministic fixtures, and independently packable public packages.
- Add the comparison product: durable multi-variant race orchestration, correctness-first ranking, terminal progress, standalone HTML and CI reports, patch and observable trajectory inspection, baseline regression decisions, explicitly confirmed redacted exports, and a reproducible public three-Agent fixture demo.
- Add the Pi-native PatchRace package and workflow: project-local package loading
  and reload, confirmed race execution, evidence-linked coach/diagnosis,
  hash-verified candidate review and decisions, preview-first promotion/rollback,
  durable run/report navigation, and offline package lifecycle compatibility
  coverage.

### Patch Changes

- Fail visibly when durable run discovery encounters corrupt owned state instead
  of silently reporting that no run exists, and reject cleanup without an
  explicit owned run or cache target instead of returning a legacy placeholder.
- Fail closed when cleanup ownership changes after planning, and preserve
  complete malformed recovery evidence as an inspectable run instead of throwing
  away the recovery result.
- Refuse symbolic-link and multiply hard-linked run files during artifact
  append/read, recovery, and cleanup ownership checks so malicious same-user
  processes cannot redirect PatchRace file access outside the owned run tree.
- Harden explicit redacted exports with a code-free shareable report projection,
  encoded-value and bounded stream redaction, frozen runtime redaction values,
  typed OTLP sensitive-field handling, no-follow source reads, and prominent
  unknown-secret limitations.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @patchrace/contracts@0.1.0-rc.0
