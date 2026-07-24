# Verification

Last verified: 2026-07-23

PatchRace uses deterministic checks before optional model judgment. The current
`v0.1.0-rc.2` source tree has the following evidence:

- 75 test files and 246 tests pass;
- TypeScript build, strict type checking, formatting, lint, schema generation,
  fixture verification, and compiled CLI smoke pass;
- the maintained diagnosis set has 18/18 correct high-confidence findings
  across 21 labeled cases;
- the provider-free quickstart completes
  `init → doctor → race → report → diagnose → clean`;
- package-content and license checks pass for all nine public packages;
- macOS and Ubuntu, arm64 and x64, Node 22 and 24 are covered by the release
  matrix;
- a budget-bounded real Pi + DeepSeek task passed every deterministic gate.

Run the main local verification:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

Useful narrower checks:

```bash
corepack pnpm docs:quickstart
corepack pnpm examples:verify
corepack pnpm qa:diagnosis
corepack pnpm qa:public
corepack pnpm qa:release
```

The live-provider run is documented separately in [LIVE_E2E.md](LIVE_E2E.md).
It is not part of automated CI because it requires a provider credential and
spends quota.

## Claim boundary

This evidence validates the checked source, fixtures, release contents, and one
small live-provider path. It does not prove that arbitrary repositories are
safe, that redaction catches every secret, that worktrees sandbox the host, or
that one agent/model is universally better. Provider behavior, authentication,
pricing, and model quality can change independently of this repository.

