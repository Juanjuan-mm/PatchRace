# Current Progress

Last updated: 2026-07-23

This file is the authoritative current snapshot. Historical work belongs in [SESSION_LOG.md](SESSION_LOG.md); task definitions and status belong in [TASKS.md](TASKS.md).

## Snapshot

- Project stage: public source-preview preparation
- Current milestone: `M11 — Public GitHub launch`
- Active task: `LCH-14 — Publish source-only GitHub preview` (`DOING`)
- Next recommended task: owner hands-on use after the preview is verified
- Latest completed task: `QA-09 — M10 release-candidate review`
- Public version: not released
- Repository state at plan creation: empty Git repository on `main`, no commits

## Milestone status

| Milestone | State | Completed | Exit review |
|---|---|---:|---|
| `M0` Product foundation | DONE | 8/8 | `F0-08` passed |
| `M1` Architecture and feasibility | DONE | 15/15 | `ARC-09` passed |
| `M2` Development foundation | DONE | 10/10 | `DEV-10` passed |
| `M3` Execution core | DONE | 12/12 | `CORE-12` passed |
| `M4` Agent adapters | DONE | 10/10 | `ADP-10` passed |
| `M5` Tasks and grading | DONE | 13/13 | `EVAL-13` passed |
| `M6` Comparison product | DONE | 11/11 | `CMP-11` passed |
| `M7` Diagnosis | DONE | 9/9 | `DIA-09` passed |
| `M8` Pi teaching loop | DONE | 17/17 | `TCH-17` passed |
| `M9` Pi-native UX | DONE | 7/7 | `PI-07` passed |
| `M10` Hardening and beta | DONE | 15 DONE / 2 DROPPED | `QA-09` passed under `ADR-022` |
| `M11` GitHub launch | DOING | 1/14 | `LCH-13` |

Operations: 2/2 control tasks complete. The ledger currently contains 143 milestone tasks plus two operations tasks.

## Current blockers

No product/release-candidate blocker is active for the source-only GitHub
preview. The public repository now exists at
<https://github.com/songjinmiao/PatchRace>; exact source/tag push, repository
settings, prerelease creation, and hosted CI verification remain. `ADR-022`
accepts the residual risk of publishing before independent-user beta; the
actual result remains 0/5 and is disclosed as unvalidated.

## Active acceptance checks

`LCH-14` must push the exact reviewed commit and `v0.1.0-rc.1` tag, configure
the public repository and private vulnerability intake, create a GitHub
prerelease from the checked notes, and verify remote identity, public files,
settings, and hosted checks. npm publication remains false.

## Local E2E readiness

- A user-provided DeepSeek test credential is available through macOS Keychain without repository persistence. Retrieval metadata and handling rules are recorded in [MAINTENANCE.md](MAINTENANCE.md#local-e2e-credential-registry).
- Endpoint, model, budget, and the exact authorized E2E task must still be declared before use.

## M10 entrance constraints

- M9 confirmation and authority boundaries remain frozen: race warns before
  repository/Agent execution; reflection is explicit; approval enables
  validation only; promotion/rollback remain preview-first and project-local.
- Pi project trust, packages, Extensions, repository commands, and worktrees are
  not a host sandbox and must never be described as one.
- Real provider/credentialed dogfood requires exact user authorization, declared
  endpoint/model/task, and budget. Local deterministic and package tests remain
  the default.

## Immediate queue

1. `LCH-14` — Push, configure, prerelease, and verify `v0.1.0-rc.1`.
2. Owner hands-on use and public-preview issue response.
3. Triage any findings without claiming independent beta validation.

## Working metrics

These are frozen by `F0-05`; full definitions and stop criteria are in [SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md):

| Metric | Target | Current evidence |
|---|---:|---|
| Prepared-example time to first valid comparison | ≤ 5 minutes | 5.699 seconds from prepared dependencies; 7.244 seconds including frozen install on one maintained reference machine |
| Dogfood runs before launch | ≥ 50 | 50 passing/55 started deterministic local CLI runs; 10 tasks and all 3 adapters |
| Target-user beta participants | ≥ 5 before stable/npm release | 0; explicitly waived only for the `v0.1.0-rc.1` GitHub preview by `ADR-022` |
| Public realistic example ecosystems | ≥ 3 | 3 deterministic comparisons: TypeScript, Python, POSIX shell |
| Reproducible held-out Pi improvement cases | ≥ 1 | 1 deterministic resource fixture; live model evidence pending |
| Known critical safety/privacy defects at launch | 0 | 0 known unresolved critical/high after QA-06 security and QA-07 privacy reviews |
| High-confidence diagnosis precision on labeled set | ≥ 80% | 100% (18/18 high-confidence predictions on 21 maintained cases; 85.7% case coverage) |

## Latest change

2026-07-23 — Completed `LCH-01`: authenticated GitHub owner `songjinmiao`
created the public <https://github.com/songjinmiao/PatchRace> repository after
an authenticated lookup confirmed it did not exist and a public search returned
zero exact-name repositories. npm returned 404 for `patchrace`,
`pi-patchrace`, and `@patchrace/contracts`; those names remain unreserved and
unpublished for the source-only preview. Domains and social handles are unused.
`LCH-14` is now active.

2026-07-23 — Completed `QA-09` and M10 under `ADR-022`: all nine public
packages are versioned `0.1.0-rc.1`; the CLI and durable controller provenance
use that manifest version. `pnpm check` passed 75 files/245 tests and the
compiled journey. `pnpm qa:rc` passed the 110-file link/claim/source scan and
rebuilt/audited nine tarballs, 274 integrity entries, seven production and 244
development licenses. The fresh source install/quickstart reached a valid
report in 6.548 seconds, and all documentation, realistic-example, and
55-run dogfood verifiers passed. Independent-user beta remains 0/5, waived only
for this source-only preview.

2026-07-23 — Accepted `ADR-022` at the owner's direction: the five-person
pre-publication beta and its issue-closing task are dropped from the
source-only `v0.1.0-rc.1` GitHub preview path, not represented as passed.
`QA-09` is now active. All deterministic correctness, safety, privacy,
documentation, dogfood, package-content, and release-candidate gates remain;
the preview must disclose 0/5 independent users and cannot claim stable/npm or
beta-validated status.

2026-07-23 — Strengthened the blocked `BETA-02` gate: added an isolated
private-beta verifier self-test. Five temporary eligible records passed all
seven calculated gates with correct median/p90; fewer than five records,
samples, implementation authors, duplicate IDs, and sensitive contact data
were rejected. Every temporary root was removed and the real collection
remained 0/5. `pnpm check` again passed 75 files/244 tests.

2026-07-23 — Prepared but blocked `BETA-02`: added an independent-user
protocol, no-intervention participant guide, privacy-minimized JSON Schema and
non-counting template, local collection initializer, structural verifier, and
sample/author/duplicate/PII/failure/metric/gate validator. `beta:prepare`
created no synthetic participant; `beta:protocol:verify` passed; `beta:verify`
correctly returned `BLOCKED` with 0/5 participants and null activation
statistics. Full `pnpm check` passed 75 files/244 tests. Five actual independent
target users are required before BETA-03 or QA-09 can start.

2026-07-23 — Completed `BETA-01`: 55 compiled CLI dogfood races produced 50
passing end-to-end results and 5 expected, classified Agent failures across 10
tasks. Passing adapter distribution was Pi 17, Claude Code 17, Codex 16.
Readable/recoverable evidence was 55/55, all 55 cleanup previews/confirmations
preserved unrelated state, and zero orphaned worktrees remained. Ten chaos
classes passed; five teaching cycles produced two promote-eligible and three
required rejections; the protected 8/2/2 holdout case passed without ID
disclosure or retuning. The verifier rehashed all 55 retained reports. Full
check and nine-package pack passed. Scope is deterministic local mechanics:
provider/credential/network/paid calls and live model quality remained false.

2026-07-23 — Completed `DOC-05`: added public-safe TypeScript HTTP
`Retry-After`, Python exact invoice aggregation, and POSIX-shell TSV failure
selection repositories. `pnpm examples:verify` twice created three temporary
Git repositories and six trials: the no-change harness failed each deterministic
test gate, the reviewed fix passed, correctness-first ranking selected the
passing fixture, cleanup preserved primary/unrelated state, and JSON/HTML
reports were retained locally. The checked 12-task teaching case also passed
8/2/2 training/validation/holdout separation with hidden final IDs, one
mutation, one-time final gate, and no retuning. Full check and nine-package pack
passed without provider, credential, or network access.

2026-07-23 — Completed `DOC-04`: added separate Agent-adapter and deterministic
grader contributor guides covering public contracts, closed v0.1 runtime-plugin
boundaries, package placement, probe/raw-first/cancellation/hidden-verifier
rules, required success/failure fixtures, dependency/ADR/Changeset review, and
exact verification commands. The verifier checked seven public exports and
five maintained fixture suites. `pnpm check` passed 75 files/244 tests and
`release:pack` audited all nine packages.

2026-07-23 — Completed `DOC-03`: added one operational security, privacy, and
cleanup guide covering the non-sandbox trust model, local-sensitive retention,
repository/package/Agent/Pi-resource risks, bounded shareable projection and
redaction limitations, four previewed exact cleanup forms, interrupted-run
recovery, incident evidence preservation, automatic-action denials, and the
missing pre-publication private reporting endpoint. Its verifier matched the
QA-06/QA-07/threat/CLI boundaries. `pnpm check` passed 75 files/244 tests and
`release:pack` audited all nine packages.

2026-07-23 — Completed `DOC-02`: added a contract-aligned concepts and
methodology guide covering task/variant/attempt identity, model versus harness
versus workflow comparisons, correctness-first gates, repeated-run statistics,
observable trace limits, all seven failure categories, candidate evaluation,
one-time holdout separation, evidence tiers, and supported/unsupported claims.
The structural verifier matched three comparison axes, seven taxonomy
categories, and the task, diagnosis, and optimizer contracts. `pnpm check`
passed 75 files/244 tests and `release:pack` audited all nine packages.

2026-07-23 — Completed `DOC-01`: added source installation and a
provider-free five-minute quickstart with prerequisites, trust boundary,
retained local-report paths, cleanup semantics, real-repository setup, packed
maintainer checks, troubleshooting, and publication limitations. A verifier
copied the repository without dependencies/build output, completed a frozen
install in 1.343 seconds, and reached a valid two-trial report in another 5.699
seconds (7.244 seconds total), with no provider or credential access and
unrelated state preserved. `pnpm check` and the nine-package `release:pack`
audit passed.

2026-07-23 — Completed `QA-08`: upgraded release packing to an explicit
allowlist with license/README/entry/schema, dependency rewrite, lifecycle,
source-map, secret/path, bin, and provenance checks. All 9 local tarballs, 274
integrity-bearing registry lock entries, 7 production and 244 installed
development package/version licenses, 208 published source maps, 2 SHA-pinned
workflows, and the fixed 9-package Changesets group passed. npm reported no
known vulnerabilities; official metadata matched all 7 production
version/integrity/license records; no NOTICE is required. An isolated npm
consumer installed the local tarballs and passed the complete CLI smoke.
Nothing was published or signed: versions remain `0.0.0`, and actual
namespace/OIDC/tag/post-publication evidence remains a launch gate.

2026-07-23 — Completed `QA-07`: added a malicious public-export fixture for
prompts, paths, five credential families, source code, three personal-data
classes, false positives, and an intentionally retained unknown format. Fixed
five findings: encoded-value and cross-chunk leakage, ignored configured runtime
redaction values, typed OTLP secret fields, export of the complete code-bearing
local report, and path-based export reads. Runs now produce a code/path/trace-free
`report/shareable/` projection; export accepts only that projection and remains
previewed, config-bound, confirmed, create-new, and explicitly incomplete.
`pnpm qa:privacy` passed 14 files/47 tests; full `pnpm check` passed 75
files/244 tests, M6 reverified all 16 demo artifacts, all nine packages
dry-packed, and seven production dependency licenses passed.

2026-07-23 — Completed `QA-06`: reviewed all 15 principal threats and the
required command-injection, traversal/link, malicious-repository, secret,
generated-Skill, package, cleanup, and recovery attack classes. The review found
and fixed one high-impact same-user link-redirection issue: mutable and
ownership-bearing files now use no-follow, regular-file, single-hard-link
handles, with external-sentinel preservation regressions. `pnpm qa:security`
passed 34 files/115 tests and scanned 104 production TypeScript files plus ten
package manifests; npm reported no known vulnerabilities. Full `pnpm check`
passed 74 files/239 tests, all nine packages dry-packed, and seven production
dependency licenses passed. PatchRace remains explicitly not a sandbox, and
`QA-07`/`QA-08` retain independent privacy and release-supply-chain gates.

2026-07-23 — Completed `QA-05`: added `pnpm qa:performance` and a
release-facing benchmark. Two reference executions passed the absolute
orchestration gate (scheduler ≤0.0315 ms/trial maximum sample; process runner
≤304.69 ms cold/maximum), generated a 51.35 MiB normalized run report in
24.75–26.89 ms at 485.02–485.05 MiB peak RSS, retained 102.47 MiB of
normalized JSON plus HTML under the 2 GiB default disk budget, bounded a
100,000-event trajectory to 10,000 presentation events, and reached 5.03×
or better with four ready workers.

2026-07-23 — Completed `QA-01`: documented the six-layer automated test
pyramid and invariant mapping; added direct core command, real no-shell Pi
bridge, corrupt-run visibility, and complete diagnosis-report regressions; and
made a compiled CLI child-process journey part of `pnpm check`. The smoke test
completed init → doctor → two-variant race → JUnit report → diagnose → cleanup
preview/confirm in a fresh Git repository while preserving the primary
worktree and unrelated state. `pnpm check` passed 72 test files/222 tests,
coverage recorded 86.44% statements/76.10% branches/83.92% functions/85.10%
lines, `pnpm m9:verify` passed, all nine packages dry-packed and scanned, and
the seven-package production license inventory passed. No provider,
credential, paid call, registry fetch, publish, commit, or push occurred. A
true clean consumer registry install and cross-platform evidence remain
explicit `QA-02`/`LCH-06` work.

2026-07-23 — Completed `PI-07` and M9: all seven Pi-native UX tasks passed
official package manifest/project trust/reload, exact-argv race confirmation,
evidence-linked fact/hypothesis separation, hash-verified candidate review,
append-only approve/reject decisions, preview-first promote/rollback, durable
status/report navigation, and package lifecycle. `pnpm check` passed 71 test
files/215 tests; `pnpm pi:compat` passed real offline project-local
install/filter/reload/update/remove on Pi 0.81.1; all nine packages dry-packed
and the seven-package production license inventory passed. No provider,
credential, Keychain, paid Agent, git/npm network fetch, publish, global Pi
write, commit, or push occurred. `QA-01` is dependency-ready.

2026-07-23 — Completed `TCH-17` and M8: all 17 teaching-loop tasks passed
read-only resource inventory, conservative routing/no-mutation, exact candidate
lineage/staging/generation/review, one-variable contamination gates, protected
split/one-time holdout, enforceable search budgets, raw-dimension Pareto
selection, explicit promotion/rollback, and composed `teach pi`. The checked
12-task fixture hid holdout IDs, improved final success from 0 to 1, passed all
hard gates, stayed within every frozen budget, and disabled retuning. `pnpm
check` passed 61 test files/184 tests, `pnpm m8:verify` passed structural,
security, claim, and demo gates, and all nine packages dry-packed without
provider, credential, paid, publish, global-Pi, or activation actions. `PI-01`
is dependency-ready.

2026-07-23 — Completed `DIA-09` and M7: all nine diagnosis tasks passed
observable-only taxonomy/features/alignment/rules, strict optional reflection,
controlled workflow/capability classification, evidence-resolving JSON/HTML and
real local `race → diagnose` replay. The 21-case labeled gate achieved 18/18
high-confidence precision, 18/21 coverage, zero false positives, and zero unsafe
findings; capability cases abstained without controlled peers. `pnpm check`
passed 47 test files/140 tests, `pnpm m7:verify` passed the structural/security
gate, and all nine packages dry-packed without provider, credential, network, or
paid calls. `TCH-01` is dependency-ready.

2026-07-23 — Completed `DIA-08`: added 21 maintainer-labeled public-safe cases
covering all seven categories plus a quality evaluator for precision, coverage,
per-category support, false positives, unclassified cases, and unsafe/speculative
authority. The production rule pipeline achieved 18/18 (100%) high-confidence
precision, 18/21 (85.7%) case coverage, and zero unsafe findings; three capability
cases remained safely unclassified. All 47 test files/140 tests and strict
TypeScript passed. `DIA-09` is dependency-ready.

2026-07-23 — Completed `DIA-07`: added multi-case diagnosis report contracts,
fail-closed artifact/event/gate citation resolution, deterministic JSON and inert
escaped HTML, and a real `patchrace diagnose` composition path over durable run
artifacts. The command never reruns Agents/graders and refuses unconfigured
reflection. All 46 test files/138 tests, strict TypeScript, and ESLint passed.
`DIA-08` is dependency-ready.

2026-07-23 — Completed `DIA-06`: implemented conservative workflow/configuration,
likely model capability, and insufficient-evidence classification. Capability
requires two valid successful same-task/adapter/harness/workflow model-only peers;
capability and insufficient results explicitly prohibit configuration mutation.
All 44 test files/135 tests and strict TypeScript passed. `DIA-07` is
dependency-ready.

2026-07-23 — Completed `DIA-05`: added the optional reflection provider
boundary over bounded redacted evidence, strict output/citation validation,
provider/model/input provenance, and low-confidence non-promotable hypotheses
beside unchanged deterministic facts. All 43 test files/131 tests and strict
TypeScript passed using only an in-memory stub. `DIA-06` is dependency-ready.

2026-07-23 — Completed `DIA-04`: added stable deterministic findings for direct
tool errors, stale/missing verification, discovery loops, unchanged failed
retries, and explicit constraint gates. Findings cite exact trace/grader
evidence, alternatives, limitations, rule provenance, and bounded mutation
targets; invalid/insufficient evidence returns unknown. All 42 test files/128
tests and strict TypeScript passed. `DIA-05` is dependency-ready.

2026-07-23 — Completed `DIA-03`: added semantic cross-Agent alignment for
observable file/list/search/test/command/edit/error actions, including
package-manager-independent test alignment, order/provenance retention, explicit
single-variant/unavailable evidence, and hidden-reasoning exclusions. All 41 test
files/124 tests and strict TypeScript passed. `DIA-04` is dependency-ready.

2026-07-23 — Completed `DIA-02`: implemented schema-versioned deterministic
trajectory features for file coverage, search loops, command failures,
time/test order, edit footprint, retries, and cross-trial deltas. Empty unknown
lanes remain unavailable rather than fabricated zeroes. All 40 test files/122
tests and strict TypeScript passed. `DIA-03` is dependency-ready.

2026-07-23 — Completed `DIA-01`: froze discovery, context, workflow, tool,
verification, capability, and unknown definitions with positive examples,
non-overlap rules, conservative precedence, executable exports, architecture
documentation, and deterministic tests. All 39 test files/118 tests and strict
TypeScript passed without model or network calls. `DIA-02` is dependency-ready.

2026-07-23 — Completed `CMP-11` and M6: all 11 comparison tasks passed the real
local CLI adapter/worktree/grader/artifact/report/export flow, 38 test files/116
tests, 16-file public three-Agent byte replay, M6 structural/security/claim gate,
and nine-package dry run. The demo is explicitly captured fixture evidence with
unavailable usage and no universal-best claim; no vendor, credential, network,
or paid call occurred. `DIA-01` is dependency-ready.

2026-07-22 — Completed `EVAL-13` and M5: all 13 task/grading tasks passed the dedicated structural, reference replay, holdout/leakage, risk, threat-model, quality, and package gates. The ten-task inventory remains 9 eligible/1 deliberate flaky across three ecosystems with three external hidden verifiers; host-only secrecy is honestly `unknown`, not promoted to valid. `pnpm check` passed 27 test files/85 tests, `pnpm m5:verify` passed 13/13, and all nine package dry runs passed. `CMP-01` is dependency-ready.

2026-07-22 — Reconciled the previously missed root `AGENTS.md` against current controls, architecture, security, implementation, and release gates. Corrected contracts ownership, Changesets coverage, unchecked typing, causal errors, and unrelated-state preservation; a 170-file temporary Git checkout passed the nine-package release plan, 15 test files/43 tests, packaging, M3/M4 verifiers, and license gates without paid calls or credential access. `EVAL-01` remains next.
