# Changesets

For any user-visible package change, run `pnpm changeset`, select the affected packages, and describe the change in release-note language. Documentation-only and internal test-only changes do not require a changeset.

`pnpm release:version` applies pending changesets locally. `pnpm release:pack` builds all publishable packages and creates inspectable tarballs under `.artifacts/packages/` without publishing anything.
