# M6 Comparison Product Review

Status: passed 11/11 tasks  
Reviewed: 2026-07-23

## Exit decision

M6 passes. A reviewed suite can now execute through the `run`/`race` CLI
composition boundary, keep the same frozen task snapshot across independently
identified model, harness, and workflow variants, grade deterministic evidence,
rank correctness first, and produce durable terminal, JSON, HTML, JUnit, SARIF,
patch, and normalized-trajectory views. Reports can be compared to immutable
baselines and exported only through a separate previewed, confirmed redaction
workflow.

The product is useful without M7 diagnosis or M8 optimization: users can run a
comparison, inspect which hard gate passed or failed, follow artifact links, view
raw secondary dimensions, and retain a bounded report. Nothing in M6 diagnoses
private reasoning, generates a Pi candidate, or activates configuration.

## Task evidence

| Task | Acceptance evidence |
|---|---|
| `CMP-01` | `comparison.ts` public wire types, `core/race.ts`, and the real CLI integration freeze task/baseline hashes, independent variant dimensions, attempts, budgets, probed adapter versions, sanitized invocation provenance, worktrees, graders, and durable artifacts. Verified resume reuses the frozen plan/run identity only for trials with no invocation artifacts or worktree; partial attempts fail closed. |
| `CMP-02` | `diagnosis/ranking.ts` places valid hard gates before configured stability, cost, latency, and footprint; regression tests prove cheaper failed output cannot win. |
| `CMP-03` | `cli/terminal.ts` emits append-only sanitized stderr progress, represents interruption/terminal states, and is silent in JSON mode; the CLI fixture exercises human and machine modes. |
| `CMP-04` | `report/index.ts` builds stable report JSON and standalone HTML with overview, gates, metrics, evidence, caveats, provenance, strict CSP, no scripts, and complete escaping. |
| `CMP-05` | `report/patch.ts` provides bounded unified and aligned diffs, changed/protected paths, binary/truncation labels, and phase-gated human reference evidence. |
| `CMP-06` | `diagnosis/timeline.ts` aligns only normalized observable file/search/command/edit/test/error events, retains event provenance, and labels unavailable vendor lanes. |
| `CMP-07` | `report/formats.ts` emits canonical JSON, escaped JUnit XML, and SARIF 2.1.0 deterministic-gate findings without HTML scraping. |
| `CMP-08` | `diagnosis/regression.ts` plus `core/baselines.ts` provide create-new baselines, non-rewriting supported migration views, comparable raw deltas, and explicit promote/hold/reject inputs. |
| `CMP-09` | `core/report-export.ts` and CLI `report --redacted` require a distinct destination, preview commitment, source-drift check, and explicit confirmation; raw evidence is preserved. |
| `CMP-10` | `pnpm m6:demo` clean-builds and byte-checks 16 Pi/Claude/Codex fixture report/evidence artifacts, with every HTML evidence link resolving locally. |
| `CMP-11` | This review, `scripts/verify-m6.mjs`, full repository quality, packaging, risk, threat, Changeset, and project-control reconciliation close the milestone. |

## End-to-end evidence

The local CLI integration uses a disposable Git repository and a healthy fake Pi
executable with the real Pi CLI adapter. It performs version preflight, exact
worktree creation, Agent invocation, normalized trace capture, public verifier
execution, assertions, patch/grade/metrics/result finalization, worktree cleanup,
correctness-first ranking, report generation/regeneration, terminal/JSON stream
separation, and redacted preview/confirmation. It leaves only the original Git
worktree. It executes no vendor Agent or credential path.

The same fixture also reconstructs an interrupted two-trial run, resumes both
unstarted trials under the original run and trial IDs, and rejects a second
interrupted run after an invocation artifact is present. Concurrent coordinator
transitions are serialized into contiguous event sequences, so recovery never
silently duplicates a completed or partially invoked attempt.

The public demo uses frozen captured/synthetic evidence rather than a live vendor
benchmark. Its one task and one attempt per variant intentionally produce two
passes and one failed hard gate; token and cost metrics remain unavailable. The
report says that it applies only to the recorded snapshots/configuration and
cannot establish a universally best Agent.

## Verification

- `pnpm check` passed formatting, ESLint, strict TypeScript, 38 test files / 116
  tests, seven base fixtures, four intentional quality failures, and build/schema
  generation.
- `pnpm m6:demo` built the workspace and byte-verified 16 checked JSON, HTML,
  JUnit, SARIF, patch, grade, trace, and result artifacts.
- `pnpm m6:verify` passed all 11 ledger rows, required modules/tests, CLI
  composition, side-by-side patch and trajectory rendering, report
  security/claim checks, evidence-link resolution, demo provenance, Changeset,
  risk/threat, and project-control checks.
- `pnpm release:pack` built and packed all nine public packages without
  publishing.

No paid model call, vendor authentication, Keychain access, credential lookup,
network upload, telemetry, commit, branch mutation, or global Pi mutation
occurred. The dependency graph gained only existing internal workspace links in
the CLI package; no external runtime dependency was added.

## Correctness, security, and claim audit

- A hard-gate failure cannot be rescued by cost, latency, stability, footprint,
  or any optional future judge.
- `unknown` hidden-verifier integrity is excluded from valid ranking evidence;
  ordinary worktrees are never described as host containment.
- Missing token/cost/event dimensions remain `unavailable`, not zero.
- Invocation evidence records probed normalized versions, auth readiness,
  environment names, budgets, and hashes executable paths/prompts without
  persisting environment values or prompt text.
- Resume requires the exact stored config, task, adapter-version, variant, and
  budget identity; existing trial artifacts or worktrees cause a fail-closed
  conflict before any Agent invocation.
- HTML content is escaped and protected by a default-deny CSP with no script,
  object, form, base, font, image, analytics, or remote resource dependency.
- Raw local evidence is never redacted in place. Shareable output is a distinct,
  selected, create-new tree with a residual-risk warning.
- Baselines are create-new, migrations are derived views, and `promote` is only a
  comparison decision input; M8 remains responsible for candidate activation.
- The demo and report use task/configuration-specific language, exact counts, and
  small-sample/captured-evidence caveats.

## Residual limitations

- Running repository and Agent processes is still host execution, not a sandbox.
- Hidden verifier secrecy remains `unknown` without an enforcing filesystem
  backend.
- Redaction cannot guarantee removal of unknown secret formats.
- Captured fixture evidence proves deterministic product behavior, not current
  live vendor quality, cost, authentication, or compatibility.
- One-attempt demo ranks are illustrative only. Real claims require repeated,
  representative task evidence.
- Browser accessibility, very large reports, malicious imported artifacts, and
  cross-platform live-agent compatibility retain M10 owners.

## M7 entrance

`DIA-01` is dependency-ready. M7 may consume normalized timelines and durable
comparison evidence, but must not weaken M6 hard gates, unavailable semantics,
claim boundaries, or evidence provenance.
