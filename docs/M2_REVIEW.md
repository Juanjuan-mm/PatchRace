# M2 Development Foundation Review

Status: passed 10/10 tasks on 2026-07-22

## Decision

`M2 — Development foundation` passes. PatchRace now has a reproducible strict-ESM TypeScript workspace, stable CLI and diagnostic boundaries, deterministic cross-ecosystem fixtures, local and hosted quality gates, contributor/release workflows, and dependency controls. `M3` may start with `CORE-01`.

## Task evidence

| Task | Result | Evidence |
|---|---|---|
| `DEV-01` | PASS | Nine package workspaces, pnpm 10.34.5 with SHA-512 pin, Node `>=22.22.0 <25`, shared strict TypeScript 6.0.3 config, project references, frozen lockfile, clean-room install/build. |
| `DEV-02` | PASS | `pnpm check` runs Prettier, ESLint, TypeScript, Vitest, seven repository scenarios, four intentional quality failures, and the build; 3 test files/6 tests pass. |
| `DEV-03` | PASS | PR/push CI covers Ubuntu/macOS and Node 22.22/24 with pnpm caching, frozen install, the unified gate, and packaging; actions are full-SHA pinned. |
| `DEV-04` | PASS | TypeScript and Python success plus task failure, dirty Git state, held-back verifier injection, forced timeout, and conflicting-patch fixtures replay deterministically. |
| `DEV-05` | PASS | All 11 v0.1 routes parse and expose help; errors map to exit codes 0–11; JSON goes to stdout and human placeholders to stderr; injected services prove no hidden side effects. |
| `DEV-06` | PASS | Structured JSONL logging supports levels, injected sinks, explicit secret masking, known token-pattern masking, and versioned diagnostic bundles with injected time. |
| `DEV-07` | PASS | `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`, pull-request checklist, DCO policy, test/fixture conventions, task-record rules, and release policy form a clean-checkout workflow. |
| `DEV-08` | PASS | Fixed Changesets group, status/version commands, changelog skeleton, and `pnpm release:pack`; nine tarballs are built without publishing and audited for forbidden contents. |
| `DEV-09` | PASS | Frozen lockfile, store/peer integrity, 24-hour release-age policy, lifecycle-script denial, SHA-pinned actions, dependency review, weekly audit, license inventory, and bounded Dependabot updates. npm audit found no known vulnerabilities. |
| `DEV-10` | PASS | `scripts/verify-m2.mjs --clean-room` copied 121 source files into a new temporary tree, performed frozen install, full gate, nine-package dry run, and license inventory successfully. |

## Verification performed

```text
pnpm check
  prettier: pass
  eslint: pass
  TypeScript project graph: pass
  Vitest: 3 files, 6 tests passed
  repository fixtures: 7 scenarios passed
  intentional quality failures: 4 categories detected
  build: pass

pnpm supply-chain:audit
  no known vulnerabilities

pnpm supply-chain:licenses
  1 external production package, license policy passed

pnpm release:pack
  9/9 tarballs produced; package-content denylist passed

node scripts/verify-m2.mjs --clean-room
  121 source files; frozen install, check, pack, and license inventory passed
```

The repository currently has no commit and no remote, so GitHub-hosted jobs cannot yet produce a run URL. This is not hidden as hosted evidence: the exact CI command path passed in a fresh macOS/Node 22 source tree, the workflow structurally enforces the macOS/Linux Node 22/24 matrix, and the first push must confirm the hosted matrix. Cross-platform release hardening remains owned by `QA-02`.

## Package and privacy audit

The release dry run includes compiled JavaScript, declarations, source maps, package metadata, README, and Apache-2.0 license. It excludes tests, `.tsbuildinfo`, fixtures, node_modules, local artifacts, raw runs, credentials, and repository documentation. The generated license inventory contains logical package/version/license data and no absolute local paths.

## Risk review

No new high-impact risk was found. The one-runtime/one-external-runtime-dependency result materially mitigates installation-weight risk `R-014`. Agent drift, malicious repositories, trace privacy, authentication compatibility, and executable selection remain correctly assigned to later implementation/release gates.

## Repository-contract follow-up

After the repository-root `AGENTS.md` was discovered and read by fixed path, the M2 implementation received a supplemental compliance pass. It added the missing Changeset for the initial nine publishable packages, removed an unchecked type assertion from structured logging, and made every M2 process fixture assert preservation of a verifier-owned unrelated-state sentinel. The conflicting-patch case additionally proves that the already accepted patch remains unchanged after the second patch is rejected.

The clean-room verifier now creates a real temporary `main` Git baseline and runs `pnpm release:status` before the normal quality and packaging gates. The follow-up clean room covered 170 source files: Changesets produced the expected nine-package minor plan, 15 test files/43 tests passed, all seven M2 scenarios preserved unrelated state, nine tarballs passed content audit, and seven external production packages passed license policy. `pnpm m3:verify` and `pnpm m4:verify` also remained green. No credentialed or paid call was made.

## M3 entrance decision

`CORE-01` is dependency-ready. M3 must preserve package direction, CLI/service separation, stable machine output, fail-closed path/process behavior, immutable artifact rules, and the deterministic M2 fixture gate.
