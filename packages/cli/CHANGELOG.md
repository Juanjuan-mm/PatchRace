# patchrace

## 0.1.0-rc.1

### Patch Changes

- Report the release-candidate package version through `patchrace --version` and
  record that same version in durable run provenance instead of the development
  placeholder.
  - @patchrace/contracts@0.1.0-rc.1
  - @patchrace/core@0.1.0-rc.1
  - @patchrace/adapters@0.1.0-rc.1
  - @patchrace/tasks@0.1.0-rc.1
  - @patchrace/diagnosis@0.1.0-rc.1
  - @patchrace/optimizer@0.1.0-rc.1
  - @patchrace/report@0.1.0-rc.1

## 0.1.0-rc.0

### Minor Changes

- Add the reproducible execution core: versioned suite contracts and loading, durable run artifacts, safe worktrees and process groups, bounded scheduling, interruption recovery, redacted exports, environment inspection, and explicit cleanup.
- Establish the initial PatchRace development foundation: strict ESM TypeScript workspaces, stable CLI and error conventions, structured redacted diagnostics, deterministic fixtures, and independently packable public packages.
- Add immutable task/grader contracts, verified initialization, deterministic grading and assertions, isolated hidden verifiers, review-required Git/GitHub mining, category-aware train/validation/holdout controls, repeatable validity checks and statistics, and evidence-safe grader-integrity/leakage gates.
- Add the comparison product: durable multi-variant race orchestration, correctness-first ranking, terminal progress, standalone HTML and CI reports, patch and observable trajectory inspection, baseline regression decisions, explicitly confirmed redacted exports, and a reproducible public three-Agent fixture demo.
- Add explainable, evidence-linked diagnosis: a frozen Pi failure taxonomy,
  deterministic trajectory features and cross-Agent alignment, conservative
  rule/reflection/capability boundaries, validated JSON/HTML reports, a real
  `patchrace diagnose` replay command, and a 21-case precision and safety gate.
- Add the Pi teaching loop: read-only resource inventory, conservative
  diagnosis-to-mutation routing, reviewable project-local guidance/Skill/prompt
  candidates, explicit review, one-variable ablation, protected
  train/validation/holdout access, budgeted halving, Pareto decisions, safe
  promotion/rollback, the `patchrace teach pi` workflow, and a checked held-out
  fixture demonstration.
- Add the Pi-native PatchRace package and workflow: project-local package loading
  and reload, confirmed race execution, evidence-linked coach/diagnosis,
  hash-verified candidate review and decisions, preview-first promotion/rollback,
  durable run/report navigation, and offline package lifecycle compatibility
  coverage.

### Patch Changes

- Fail visibly when durable run discovery encounters corrupt owned state instead
  of silently reporting that no run exists, and reject cleanup without an
  explicit owned run or cache target instead of returning a legacy placeholder.
- Run the installed CLI correctly through npm's symbolic-link bin entry and
  verify clean tarball installation with an isolated npm cache.
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
- Updated dependencies
  - @patchrace/contracts@0.1.0-rc.0
  - @patchrace/core@0.1.0-rc.0
  - @patchrace/adapters@0.1.0-rc.0
  - @patchrace/diagnosis@0.1.0-rc.0
  - @patchrace/optimizer@0.1.0-rc.0
  - @patchrace/report@0.1.0-rc.0
  - @patchrace/tasks@0.1.0-rc.0
