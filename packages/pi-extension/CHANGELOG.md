# pi-patchrace

## 0.1.0

### Patch Changes

- Graduate PatchRace to its first registry-ready stable release: add protected
  npm/GitHub publication with audited tarball verification, support Node 26 and
  the release-gated Windows/macOS Intel/Ubuntu 22 platform lanes, and allow an
  explicit executable argument prefix for portable script-backed Agent CLIs.
- Updated dependencies
  - @patchrace/core@0.1.0

## 0.1.0-rc.2

### Patch Changes

- @patchrace/core@0.1.0-rc.2

## 0.1.0-rc.1

### Patch Changes

- @patchrace/core@0.1.0-rc.1

## 0.1.0-rc.0

### Minor Changes

- Establish the initial PatchRace development foundation: strict ESM TypeScript workspaces, stable CLI and error conventions, structured redacted diagnostics, deterministic fixtures, and independently packable public packages.
- Add the Pi-native PatchRace package and workflow: project-local package loading
  and reload, confirmed race execution, evidence-linked coach/diagnosis,
  hash-verified candidate review and decisions, preview-first promotion/rollback,
  durable run/report navigation, and offline package lifecycle compatibility
  coverage.

### Patch Changes

- Fail visibly when durable run discovery encounters corrupt owned state instead
  of silently reporting that no run exists, and reject cleanup without an
  explicit owned run or cache target instead of returning a legacy placeholder.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @patchrace/core@0.1.0-rc.0
