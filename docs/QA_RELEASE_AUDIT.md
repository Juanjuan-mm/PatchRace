# QA-08 Dependency, License, and Release Audit

Status: QA-08 passed; versioned release-candidate recheck pending QA-09  
Reviewed: 2026-07-23  
Publication performed: no

## Release decision

The current dependency graph, lockfile, licenses, package allowlists, local
would-be-published tarballs, and provenance configuration pass the QA-08 gate.
There are no known high or critical npm advisories at the review time. All 274
registry-backed lock entries carry integrity hashes, and npm registry metadata
for all seven production dependencies matches the exact locked version,
integrity, and license.

This is not an npm publication or signed provenance claim. All nine packages
remain at the development placeholder `0.0.0`, and the repository still has no
commit or remote. Changesets must create the release-candidate version, a
protected release workflow must be added after namespaces/repository operations
are established, and `LCH-06`/`LCH-08` must verify the actual registry packages
and signed release provenance. QA-08 proves that the local inputs and tarballs
are ready for those later authority-bearing steps.

## Dependency and lock audit

| Check | Result |
|---|---|
| Package manager | `pnpm 10.34.5` exact-pinned with integrity in `packageManager` |
| Lockfile | One v9 `pnpm-lock.yaml`; 274/274 registry entries have SHA-512 integrity |
| Frozen/store policy | Frozen preference, strict peers, store integrity, exact saves |
| Release-age policy | 1,440 minutes (24 hours) |
| Lifecycle policy | Empty `onlyBuiltDependencies`; zero workspace/tarball install lifecycle scripts |
| Production graph | 7 external packages |
| Installed development graph | 244 unique package/version pairs |
| Advisory query | No known vulnerabilities; `pnpm audit --audit-level high` passed |
| Registry comparison | 7/7 production package versions, integrity hashes, and licenses matched `registry.npmjs.org` |

The production graph is intentionally small:

| Package | Version | License | Role |
|---|---:|---|---|
| `ajv` | `8.18.0` | MIT | JSON Schema validation |
| `commander` | `15.0.0` | MIT | CLI parsing/help |
| `fast-deep-equal` | `3.1.3` | MIT | Ajv transitive runtime |
| `fast-uri` | `3.1.4` | BSD-3-Clause | Ajv URI handling |
| `json-schema-traverse` | `1.0.0` | MIT | Ajv schema traversal |
| `require-from-string` | `2.0.2` | MIT | Ajv transitive code loading |
| `yaml` | `2.8.3` | ISC | bounded YAML configuration/task parsing |

All 244 installed development package/version pairs also have known licenses
outside the configured AGPL/GPL-only/SSPL/unlicensed/unknown deny set. Production
licenses are MIT, BSD-3-Clause, and ISC. The packages are consumed as
dependencies rather than bundled or modified, and none supplies an Apache
NOTICE that must be preserved in PatchRace's distribution. A project `NOTICE`
file is therefore not required for this graph; any dependency or bundling
change triggers a new decision.

## Package-content audit

Every package is ESM, Apache-2.0, uses the same Node engine range, has
`publishConfig.access: public`, and requests npm provenance. The packer uses an
allowlist and requires package metadata, root Apache license, package README,
compiled entry JavaScript, declarations, and source maps. Contracts additionally
require all three public JSON Schemas. The CLI requires its exact bin target and
Node shebang.

| Package | Entries | Source maps |
|---|---:|---:|
| `@patchrace/adapters` | 51 | 24 |
| `@patchrace/contracts` | 66 | 30 |
| `@patchrace/core` | 71 | 34 |
| `@patchrace/diagnosis` | 51 | 24 |
| `@patchrace/optimizer` | 51 | 24 |
| `@patchrace/report` | 23 | 10 |
| `@patchrace/tasks` | 63 | 30 |
| `patchrace` | 27 | 12 |
| `pi-patchrace` | 43 | 20 |

Exact SHA-256 tarball hashes are machine-recorded in ignored
`.artifacts/release-packages.json`. They identify this local build only and will
change after versioning, source changes, or rebuild metadata changes; QA-08 does
not claim byte-for-byte npm-pack reproducibility across invocations.

The content gate rejects:

- tests, fixtures, `.tsbuildinfo`, `node_modules`, local artifacts, raw runs,
  repository documentation, uncompiled TypeScript, and unlisted paths;
- unreplaced `workspace:` or `catalog:` dependency specifiers;
- install lifecycle scripts;
- source maps with embedded `sourcesContent` or absolute source paths;
- personal macOS/Linux/Windows home paths, raw-run paths, private-key markers,
  and credential-shaped literal values.

All 208 published source maps use relative source references and contain no embedded
source content. Internal workspace dependencies were rewritten to ordinary npm
ranges. A fresh isolated npm consumer installed the nine local tarballs plus
their registry dependencies with scripts disabled and completed
init → doctor → two-variant race → report → diagnose → cleanup
preview/confirmation while preserving the primary worktree and unrelated state.

## Automation and provenance review

- CI and supply-chain workflows use full 40-character action commit SHAs,
  `persist-credentials: false`, explicit read-only permissions, frozen installs,
  the macOS/Linux Node matrix, high-severity dependency review/audit, and license
  inventory.
- Dependabot opens bounded weekly npm and GitHub Actions updates; it does not
  auto-merge sensitive changes.
- Changesets uses one fixed nine-package release group and rewrites internal
  dependency ranges together.
- Package manifests request npm provenance, but there is intentionally no
  publish workflow or credential in this repository yet. Adding the protected
  workflow, environment approvals, namespace metadata, version/tag checks, and
  actual signed attestations belongs to `LCH-01`, `LCH-04`, `LCH-06`, and
  `LCH-08`.
- `pnpm release:pack` and QA-08 never call `npm publish`, create a Git tag, push,
  or access publication credentials.

## Residual limitations and recheck triggers

Registry metadata and advisory state are point-in-time external evidence.
Package ownership, advisories, tarballs, or licenses can change, so the registry
and audit gates must rerun immediately before release. A lockfile change,
dependency change, package files/exports/bin change, source-map policy change,
Node/pnpm change, action SHA change, NOTICE-bearing dependency, or versioning
change invalidates this audit.

Actual npm packages do not yet exist, and local `0.0.0` tarballs cannot prove
registry namespace control, protected OIDC provenance, tag/version agreement,
post-publication installation, or GitHub release signatures. Those are explicit
launch blockers with later owners, not claims made by QA-08.

## QA-09 versioning update

Changesets subsequently created the fixed nine-package `0.1.0-rc.1` version.
This does not rewrite the historical QA-08 evidence above: the hashes and
`0.0.0` statements describe the artifacts audited at that review. `QA-09`
must rebuild every tarball, regenerate the hashes, rerun this audit, verify the
compiled CLI and durable controller provenance report `0.1.0-rc.1`, and retain
`published: false` because the GitHub preview does not publish npm packages.
