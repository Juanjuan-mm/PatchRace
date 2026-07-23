# @patchrace/adapters

## 0.1.0-rc.1

### Patch Changes

- @patchrace/contracts@0.1.0-rc.1
- @patchrace/core@0.1.0-rc.1

## 0.1.0-rc.0

### Minor Changes

- Establish the initial PatchRace development foundation: strict ESM TypeScript workspaces, stable CLI and error conventions, structured redacted diagnostics, deterministic fixtures, and independently packable public packages.
- Implement the shared Pi, Claude Code, and Codex adapter contract, normalized observable traces, compatibility probes, Pi SDK path, and opt-in redacted OTLP/JSON export. Publish the normalized trace event JSON Schema from the contracts package.

### Patch Changes

- Raise the Claude Code compatibility floor to 2.1.104, the first selected
  minimum with the required non-mutating auth status probe, and verify minimum
  and current Pi, Claude Code, and Codex profiles.
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
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @patchrace/contracts@0.1.0-rc.0
  - @patchrace/core@0.1.0-rc.0
