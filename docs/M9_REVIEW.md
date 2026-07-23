# M9 Pi-Native UX Review

Status: passed 7/7 tasks  
Reviewed: 2026-07-23

## Exit decision

M9 passes. A Pi user can stay in one session while configuring a race, viewing
evidence-linked diagnosis, reviewing exact candidate changes and authority,
previewing and confirming project-local promotion, restoring the exact prior
state, and reopening durable reports after session lifecycle changes.

The Pi layer remains thin. It delegates machine operations through structured
`patchrace --json` argv, reads durable owned artifacts, and stores only
schema-versioned run pointers in Pi session entries. It does not duplicate run
state, silently invoke reflection, bypass optimizer authority, publish,
configure providers, or write global Pi state.

## Task evidence

| Task | Acceptance evidence |
|---|---|
| `PI-01` | `pi-patchrace` declares an official `pi-package` manifest and compiled default extension; project-local trust, watch plus reload, no-shell delegation, bounded output, and session restoration are tested. |
| `PI-02` | `/race` supports a wizard and explicit quote-safe options, shows exact argv, confirms repository/Agent risk, streams status, retains the session, and inspects durable output. |
| `PI-03` | `/diagnose` and `/coach` resolve every citation against the immutable inventory and visually separate hard facts/rules from optional low-authority hypotheses; reflection confirms before provider use. |
| `PI-04` | `/review`, `/promote`, and `/rollback` show hash-verified diffs, validation/selection evidence, safety flags, limitations, explicit approve/reject, preview-first writes, and conflict-safe restoration. |
| `PI-05` | `/status` restores saved or newest owned run state and opens only indexed project-local regular text artifacts whose size and hash still match. |
| `PI-06` | Pure tests cover local/git/npm source identities/plans, filtering, and state preservation; real offline Pi 0.81.1 covers project install, trust, commands, filter/reload/update/remove. |
| `PI-07` | The checked one-session workflow, real optimizer filesystem lifecycle, real Pi package compatibility run, full quality/package gates, Changeset, risk/threat review, and this document close M9. |

## Safety and authority audit

- Every child process uses an executable plus argument array with `shell:
  false`; quoted user values never become shell syntax.
- Race execution is the only normal Pi action that may invoke repository
  commands or Agents, and it requires a preview plus confirmation.
- Reflection is opt-in, explicitly labeled inferred/low authority, and confirms
  before the bridge can request a configured provider.
- Candidate diff bytes are hash-checked in the TUI. Safety flags may say that
  none were detected, never that safety is guaranteed.
- Review approval enables validation only. Promotion requires separately stored
  approved and promote-eligible evidence under the frozen policy.
- Promotion and rollback are preview-first and revalidate current pre/post
  images. They touch declared project-local targets only and preserve unrelated
  state.
- Run navigation validates owned roots, symlinks, canonical descendants, index
  size/hash, supported text media, and a 2 MiB display limit.
- Package compatibility uses an isolated project/config and constructed
  environment allowlist. Global settings, credentials, providers, network
  sources, and publication are outside the test.

## Pi convention audit

The implementation matches the current official Pi package/extension contract:

- `package.json` uses the `pi-package` keyword and `pi.extensions` manifest.
- The manifest points to compiled `dist/index.js`; runtime workspace behavior is
  delegated rather than bundled into Pi internals.
- Project-local installation uses `pi install -l` and loads only after project
  trust.
- Commands register through the extension factory; status uses `ctx.ui`, and
  pointers use custom session entries that do not enter model context.
- `/patchrace reload` calls the extension command context reload lifecycle.
- Resource filters can disable all extension paths or include the exact
  manifest-declared path.

References: [Pi extensions](https://pi.dev/docs/latest/extensions), [Pi
packages](https://pi.dev/docs/latest/packages), and [Pi
security](https://pi.dev/docs/latest/security).

## Residual limitations

- The one-session workflow is deterministic captured bridge evidence, not a
  live multi-Agent quality benchmark. Live credentialed dogfood requires an
  exact later authorization and budget.
- Real package lifecycle evidence is local-path based. Git/npm behavior is
  offline plan coverage until release candidates exist; publication belongs to
  M11.
- The TUI uses standard dialogs/editors rather than a custom full-screen
  component. It covers the required evidence and controls without adding a Pi
  TUI runtime dependency.
- Pi extensions execute with the user's full host permissions after project
  trust. Project trust and Git worktrees are not a sandbox.
- Multi-file promotion retains compensation and exact records, but crash
  recovery between writes remains M10 hardening work.

## Verification

- `pnpm check` passed formatting, ESLint, strict TypeScript, 71 test files/215
  tests, seven base fixtures, four intentional quality failures, and the full
  build/schema generation.
- `pnpm m9:demo` passed the one-session workflow, durable status, and real
  promotion/rollback fixture tests.
- `pnpm pi:compat` passed on trusted local Pi 0.81.1 in an isolated offline
  project/config.
- `pnpm release:pack` built and dry-packed all nine public packages; the
  `pi-patchrace` tarball contains the manifest, README/LICENSE, compiled ESM,
  declarations, and source maps with no tests or build cache.
- `pnpm supply-chain:licenses` passed the production license inventory for seven
  external packages.
- `pnpm m9:verify` passed all seven task rows and the structural, safety,
  authority, package, documentation, risk, and threat gates.

No provider/Agent invocation, vendor authentication, credential/Keychain access,
network package fetch, telemetry, publication, commit, branch mutation, or
global Pi write occurred.

## M10 entrance

`QA-01` is dependency-ready. M10 must expand the automated pyramid and supported
environment matrix, run chaos/security/privacy/package audits, produce
documentation/examples, and collect authorized dogfood/beta evidence without
weakening the M9 confirmation or authority boundaries.
