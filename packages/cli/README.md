# patchrace

Install the stable CLI with `npm install --global patchrace@0.1.0`, or run it
once with `npx --yes patchrace@0.1.0 --help`. Installed users need Node and
Git, but not a source checkout, Corepack, pnpm, TypeScript, or a local build.

PatchRace CLI. The stable v0.1 command surface routes `doctor` and explicit
dry-run/confirmed `clean` operations to the shared core. `init` creates and verifies
a review-required manual suite without invoking an Agent. `mine` reads local Git
history, reconstructs linear parents in disposable worktrees, and writes
create-only review candidates under `.patchrace/mined/`; it neither accepts a
candidate nor runs repository code.

Race progress is emitted as append-only plain lines on stderr. `--json` machine
mode suppresses the progress presenter entirely so stdout remains one stable JSON
value.

`run` and `race` load a reviewed suite, require explicit trust for repository
commands, preflight configured local adapters, create exact worktrees, retain raw
and normalized evidence, grade deterministic gates, clean owned worktrees, and
write durable JSON/HTML/JUnit/SARIF reports. `report` regenerates a selected
presentation from durable report JSON; redacted export requires an exact preview,
separate destination, and `--confirm-export`.

`diagnose` is a pure replay over the run's immutable execution, normalized trace,
grade, and result artifacts. It builds deterministic features, rules, semantic
alignment, conservative workflow/capability classification, and evidence-linked
JSON or inert HTML without rerunning an Agent or grader. Human summaries go to
stderr; `--json` returns the stable report on stdout. `--reflect` fails closed
unless an explicitly approved redacted provider is configured.

`teach pi` composes durable diagnosis, read-only resource inventory, bounded
candidate generation/staging, exact review, budgeted screening, one-variable
validation, Pareto selection, local reporting, and promotion preview. Phases can
run separately. Review approval never activates a candidate, and validation
fails closed until an evaluator with explicit Agent and budget authority is
configured. `promote` and `rollback` remain separately confirmed operations.

`candidate review` replays the immutable staged review plus available
validation/selection evidence. `candidate decide` appends one explicit approve
for validation or reject decision without replacing the pending evidence.
`promote` now recomputes and compares the stored eligible preview before any
write; `rollback` reconstructs the exact preimage plan and refuses postimage
drift.
