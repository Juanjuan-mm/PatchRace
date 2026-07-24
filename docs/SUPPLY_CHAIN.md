# Dependency and Supply-Chain Controls

Last updated: 2026-07-23

## Enforced controls

- `pnpm-lock.yaml` is the only dependency lock and frozen installation is mandatory in CI.
- pnpm is exact-pinned with SHA-512 integrity (Corepack's hexadecimal form); package store integrity and strict peers are enabled.
- Dependencies must be at least 24 hours old unless a reviewed emergency change temporarily records an exception.
- Dependency lifecycle scripts are denied by default through an empty `onlyBuiltDependencies` list.
- CI actions use reviewed full commit SHAs and least-privilege permissions; checkout persistence is disabled.
- Pull requests receive GitHub dependency review with high-severity and selected copyleft-license denial.
- Scheduled/branch CI runs `pnpm audit --audit-level high` and validates a machine-readable production license inventory.
- Dependabot opens bounded weekly npm and GitHub Actions updates; sensitive dependency classes are reviewed rather than auto-merged.
- `pnpm release:pack` creates local inspectable tarballs without registry publication. Publishing credentials and provenance signing belong only in a later protected release job.

## Review policy

Dependency admission considers use site, license, maintenance, ESM/runtime
compatibility, lifecycle scripts, telemetry, security, and removal cost.

The license check is intentionally conservative: AGPL, GPL-only identifiers,
SSPL, unknown, and unlicensed production entries fail. A false positive must be
resolved by inspecting package metadata and recording an explicit reviewed
policy change; do not weaken the check silently.

## Release checks

The local gate checks registry lock integrity, production and development
licenses, nine package allowlists and checksums, dependency-specifier rewriting,
source-map privacy, secret/path markers, CLI bin metadata, and provenance
configuration. A separate network gate compares production integrity/license
metadata with npm and reruns the high-severity advisory query.

The source-only GitHub preview does not publish packages to npm. Namespace
ownership, protected OIDC publication, registry attestations, and
post-publication installation must be verified before any future npm release.
