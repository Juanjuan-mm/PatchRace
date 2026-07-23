# Risk Register

Last updated: 2026-07-23 — ADR-022 preview waiver

Scale: likelihood and impact are `L`, `M`, or `H`. A risk is closed only when evidence shows it no longer needs active mitigation.

| ID | Risk | Likelihood | Impact | Mitigation and evidence task | Owner/state |
|---|---|---:|---:|---|---|
| `R-001` | Agent CLI output or flags change and break adapters. | H | H | Contract and first versioned streams proven in `ARC-05`, `SPIKE-01..03`; M4 ships narrow machine-tested ranges, malformed/unknown-output evidence, and explicit refusal/degradation; minimum/current profiles rerun in `QA-04`; contribution requirements are frozen in `DOC-04`. | Open; compatibility and contributor controls pass, future vendor drift remains |
| `R-002` | Worktree cleanup damages user branches or files. | M | H | Exact-target lifecycle preserved unrelated state in `SPIKE-04`; implementation, validation, dry run, chaos, no-follow ownership files, execution-time revalidation, and user cleanup/incident guidance: `CORE-03`, `CORE-10`, `QA-03`, `QA-06`, `DOC-03`. | Open; tested ownership/link failures preserve unrelated state, non-sandbox same-user filesystem races remain |
| `R-003` | Traces or reports leak credentials, private code, paths, or personal data. | H | H | Local-first storage, code-free shareable projection, encoded/typed/runtime redaction, preview/confirmation, opt-in OTLP, security/privacy reviews, and user publication/incident guidance: `CORE-08`, `CMP-09`, `QA-06`, `QA-07`, `DOC-03`. | Open; malicious fixtures and documentation pass, unknown/transformed formats and human review remain |
| `R-004` | Generated Skills or instructions reduce performance through overfit, conflict, or context bloat. | H | H | Config lint, one-variable ablation, validation/holdout, token complexity, rollback: `TCH-01`, `TCH-10`, `TCH-11`, `TCH-14`. | Open; M8 full candidate lifecycle and deterministic held-out mitigation complete |
| `R-005` | Teacher-agent differences are mistaken for transferable workflow. | H | H | Observable evidence, capability-gap outcome, multiple teachers/tasks, conservative claims, and public deterministic compare/teach examples: `DIA-03`, `DIA-06`, `TCH-02`, `DOC-05`. | Open; fixture mechanics and conservative claims pass, representative live teachers/tasks remain |
| `R-006` | Historical tasks leak the human solution or have invalid hidden tests. | M | H | Parent reconstruction, external vault injection, review-required mining, repeat validity, protected/split leakage checks, evidence-safe integrity states, and contributor fixture/hidden-boundary guidance: `SPIKE-05`, `EVAL-05`, `EVAL-06`, `EVAL-09`, `EVAL-10`, `DOC-04`. | Open; implementation and contribution controls pass, enforced host isolation remains backend-dependent |
| `R-007` | Evaluation costs explode before useful evidence appears. | H | M | Baseline cache, hard budgets, failed-task focus, successive halving, cost reporting, local overhead benchmark, and 55 provider-free lifecycle dogfood runs: `CORE-06`, `TCH-12`, `QA-05`, `BETA-01`. | Open; deterministic lifecycle passed with no spend, representative live Agent cost remains unmeasured |
| `R-008` | Small task samples produce misleading “improvement” claims. | H | H | Protected holdout access, exact counts, repeated-run variance/Wilson intervals, mandatory small/dependence caveats, task/configuration-specific ranking, and a user methodology: `EVAL-08`, `EVAL-11`, `CMP-02`, `CMP-10`, `DOC-02`. | Open; controls and documentation complete, representative dogfood/beta evidence remains |
| `R-009` | Generic eval/optimization competitors erase product differentiation. | H | M | Pi-native resource graph, workflow distillation, open/local UX, explainable candidate lifecycle: `F0-04`, `TCH-15`, `PI-07`. | Open |
| `R-010` | Scope expands into orchestration, cloud, sandboxing, or extension marketplace. | H | M | Enforce brief non-goals and scope-change rule; defer without replacement: `F0-01`, milestone reviews. | Open |
| `R-011` | Malicious repositories or generated artifacts execute unsafe commands. | M | H | Threat model, no-shell execution, explicit trust/approval, verifier separation, inert reports, constrained candidates, package allowlists/no install hooks, security/release reviews, and operational trust guidance: `F0-06`, `QA-06`, `QA-08`, `DOC-03`. | Open; controls and documentation pass, but trusted host execution and upstream ownership remain residuals |
| `R-012` | Reusing local CLI authentication conflicts with vendor behavior or terms. | M | H | M1 used official status/invocation only, observed ready/missing states without token reads, and froze no-extraction contract; continue version/auth compatibility review: `SPIKE-01..03`, `ADP-08`. | Open; boundary validated, vendor drift remains |
| `R-013` | Project name or package namespace is unavailable or confusing. | M | M | Early and launch-time searches plus fallback names: `F0-02`, `LCH-01`. | Open |
| `R-014` | Installation becomes too heavy due to multiple runtimes or optimizer dependencies. | M | M | `ARC-08` froze a one-runtime Node core and optional out-of-process Python; clean consumer matrix, package/dependency audit, and measured fresh-source quickstart: `QA-02`, `QA-08`, `DOC-01`. | Open; fresh source reached a valid report in 7.244 seconds, actual published install remains |
| `R-015` | Diagnosis looks impressive but is not accurate or actionable. | M | H | `SPIKE-06` proved exact event citations/alternatives; implement rule-based facts, labeled set, and precision gate: `DIA-04`, `DIA-07`, `DIA-08`. | Open; M7 fixture precision/safety gate passed, representative real-repository quality remains |
| `R-016` | PATH resolves a stale, broken, or unintended agent executable and corrupts provenance. | M | H | `SPIKE-03` found a broken global Codex beside a healthy official bundled binary; M4 resolves the selected executable, executes a bounded version probe, hashes the canonical path, and refuses silent switching; QA-04 reran the actual broken/healthy identities. | Open; fail-closed PATH probe reconfirmed, future installation drift remains |
| `R-017` | Release evidence is biased or incomplete because independent target users are unavailable. | H | H | Preserve the 0/5 result, label `v0.1.0-rc.1` as a source-only unvalidated preview, make no beta/stable/npm claims, retain the five-user protocol for later evidence, and prioritize owner/public-preview feedback under `ADR-022`. | Accepted residual for the GitHub preview only; remains a blocker for stable/npm release |

## Risk review rule

- Review affected risks at the start and end of every milestone.
- Add a risk immediately when a task discovers a new high-impact failure mode.
- A release-blocking open risk must have an accepted mitigation, a documented residual risk, or a launch delay.

## M1 review outcome

All risks remain open where implementation, compatibility matrices, malicious fixtures, scale, or beta evidence is still required. M1 materially reduced feasibility uncertainty for `R-001`, `R-002`, `R-006`, `R-012`, `R-014`, and `R-015`, and added `R-016` from observed executable ambiguity. No open risk is an unresolved M2-entry feasibility blocker because each critical path now has a tested mechanism, an accepted contract, and an implementation/evidence owner. Worktrees remain non-sandbox isolation and real Claude vendor execution remains conditional on user authentication; neither limitation is hidden or reclassified as solved.

## M2 review outcome

No new release-blocking risk was discovered. `R-014` now has concrete mitigation evidence: one required Node runtime, a 239-package locked development graph, one external runtime dependency, frozen clean-room install, and nine audited dry-run tarballs. Supply-chain controls reduce dependency drift risk but do not close `R-001`, `R-003`, `R-011`, `R-012`, or `R-016`; those require adapter, redaction, malicious-repository, compatibility, and release evidence in later milestones. Hosted CI has not yet run because this local repository has no commit or remote; the full CI-equivalent gate passed on macOS/Node 22, while the configured macOS/Linux Node 22/24 matrix will provide the first hosted evidence after repository activation.

## M5 review outcome

No new release-blocking risk was discovered. `R-006` is materially reduced by
external hidden-vault loading, create-new grader injection, review-required
mining, repeated validity checks, split authorization, prompt/path/content
leakage scans, and explicit `compromised|unknown` results. It remains open
because worktrees do not confine host processes and scanners cannot prove the
absence of unknown transformed disclosures. `R-008` now has deterministic
holdout commitments and conservative repeated-run estimates with exact counts,
Wilson intervals, variance, exclusions, and small/dependence caveats; it remains
open until minimum-evidence methodology and real multi-task evidence land.
`R-002`, `R-003`, and `R-011` retain later hardening owners. The ten-task local
reference suite used no Agent, credential, network, or upload and preserved
unrelated state and exact worktree cleanup.

## M6 review outcome

No new release-blocking risk was discovered. `R-003` is materially reduced by a
script-free escaped report with default-deny CSP plus a separate, selected,
create-new redaction workflow that commits preview hashes/findings, requires an
exact destination and confirmation, detects source drift, and preserves raw
evidence. It remains open because configured scanners cannot prove absence of
unknown secrets and malicious imported-artifact coverage belongs to `QA-07`.

`R-007` now has deterministic pre-plan trial-count refusal, shared wall/trial/
token/cost/disk tracking, bounded per-Agent execution, and no silent retries.
Exact subscription cost can remain unavailable, and later optimizer search still
needs `TCH-12`, so the risk stays open. `R-008` now has correctness-first raw
dimensions, exclusion/unavailable semantics, small-sample caveats, task/config
claim boundaries, and an explicitly captured—not live benchmark—demo. It remains
open until minimum evidence tiers and representative real data land.

`R-011` remains open: CLI execution refuses until the user sets
`trustRepositoryCommands: true`, uses structured argv by default, scopes Agent
edits to exact worktrees where adapters support it, and renders patch/report text
inertly, but repository and Agent processes still execute with host permissions.
`R-001`, `R-002`, `R-006`, `R-012`, and `R-016` retain their compatibility,
cleanup, enforced-isolation, auth, and cross-platform owners. The local M6 CLI
fixture restored the exact one-worktree baseline and used no vendor credential or
network call; live multi-platform vendor evidence remains a later gate.

## M7 review outcome

No new release-blocking risk was discovered. `R-005` is materially reduced by
observable-only semantic alignment, deterministic-cause precedence, controlled
same-task/adapter/harness/workflow model-only comparison, and explicit
`no-configuration-mutation` outcomes for capability or insufficient evidence. It
remains open because M8 mutation routing and representative multiple-teacher/task
evidence are still required.

`R-015` is materially reduced by fail-closed event/gate citations, alternatives,
limitations, abstention, strict reflection authority, and a 21-case labeled gate:
18/18 high-confidence predictions correct, 18/21 case coverage, zero false
positives, and zero unsafe/speculative findings. It remains open because the set
is maintained synthetic evidence rather than representative real-repository or
beta validation.

`R-003` remains open. Diagnosis reports contain local-sensitive logical paths,
event/gate references, and claims. HTML is inert and output is create-new only,
but diagnosis is not yet integrated into the explicitly redacted shareable
export. `R-008` also remains open: capability language is bounded to recorded
tasks/variants and fixture precision is not a generalization claim. No provider,
credential, network, paid call, or new runtime dependency was used.

## M8 review outcome

No new release-blocking risk was discovered. `R-004` is materially reduced by
read-only inventory/lint, narrow typed generators, context/complexity budgets,
one-variable contamination checks, explicit review, protected validation/final
holdout, Pareto decisions, and exact rollback. It remains open because the
checked improvement is deterministic fixture evidence and real project/model
generalization requires later dogfood/beta evidence.

`R-005` now has explicit stable-fact/procedure/invoked-workflow/tool/capability
routing and preserves no mutation for capability, invalid, unknown, and
insufficient evidence. It remains open until multiple real teachers/tasks prove
transferability. `R-007` now has candidate/trial/time/token/cost envelopes,
enforceable per-trial bounds, hard-gate-first early stopping, and no unbounded
retry; unknown vendor cost stays unavailable. `R-008` gains one-time frozen
holdout gates, no-retune ledgers, separate objective dimensions, and a
fixture-scoped improvement claim, but representative sample methodology remains
open.

`R-011` remains open. M8 generators reject executable, package, credential,
hidden/reference, global-path, and automatic-action payloads; staged/review HTML
is inert; promotion/rollback uses exact project-local pre/post images. Generated
instructions are still untrusted until validation, repository/Agent execution
still has host authority, and crash-recovery hardening belongs to M10. No live
Agent/provider, credential, paid call, telemetry, publication, or global Pi
mutation occurred.

## M9 review outcome

No new release-blocking risk was discovered. `R-009` is materially reduced by a
real Pi package and one-session race → coach → review → promote/rollback flow,
plus durable status/report navigation and project-scoped package lifecycle. It
remains open until target-user beta proves repeat use and differentiation.

`R-003` remains open. The Pi TUI keeps raw reports, diagnosis, diffs, and
candidate evidence local and does not send custom session entries into model
context; artifact navigation enforces owner/path/symlink/size/hash checks.
However, displayed local evidence may still contain private repository content
and shareable diagnosis/candidate redaction remains later privacy-review work.

`R-011` remains open. M9 adds exact argv isolation, risk confirmation before
race, fail-closed evidence resolution, hash-checked review, preview-first
promotion/rollback, and project-local package trust. Pi extensions still execute
with full user permissions and trusted repository/Agent processes remain
unsandboxed. `R-014` is reduced by one Node runtime, no new runtime dependency,
compiled extension loading, filters, reload, update, uninstall, and dry-packed
contents. Git/npm clean-install timing and public package audit remain M10/M11
work.

The real Pi 0.81.1 compatibility run used an isolated project/config, offline
mode, and a constructed environment allowlist. No provider, credential,
Keychain, paid Agent, git/npm network fetch, telemetry, publication, or global Pi
write occurred.

## QA-01 review outcome

No new high-impact risk was discovered. `R-002` gained direct core-service and
compiled-CLI evidence for preview-first exact cleanup, explicit target
requirements, primary-worktree preservation, and unrelated-state preservation.
`R-011` gained a real child-process regression proving that a
shell-injection-shaped Pi bridge argument remains one argv value and creates no
file. `R-003` gained a full non-empty diagnosis-report escaping case, while
corrupt owned run state now fails visibly rather than being misreported as
absent.

These checks do not close the risks. Cross-platform cleanup/process chaos,
malicious-repository security review, privacy/export review, live adapter
compatibility, and representative dogfood/beta evidence remain owned by
`QA-02..QA-07` and `BETA-01..03`. The deterministic built-product smoke used no
provider, credential, registry fetch, telemetry, publication, commit, or push.

## QA-02 review outcome

No new release-blocking risk was discovered. `R-014` is materially reduced by
fresh frozen installs and network-resolved npm tarball consumer tests across
macOS arm64 plus Ubuntu 24.04 arm64/x64 on Node 22 and 24. The installed CLI
completed the core flow and preserved the primary worktree and unrelated state
in every cell. `R-002` gains real Linux evidence but remains open for the
deliberate chaos cases in `QA-03`.

The matrix exposed two hardening defects: npm's symbolic-link bin entry did not
match the real module path, and two Git/process-heavy validity tests inherited
Vitest's five-second harness timeout. Canonical entry-path resolution and an
explicit 20-second test-only harness limit fixed both without changing product
budgets, verifier timeouts, or assertions. Hosted GitHub Actions is still
unclaimed because the repository has no commit or remote; exact local
macOS/Linux cells provide the current evidence. Agent CLI drift, malicious
repositories, redaction, supply-chain publication, and beta reliability remain
owned by later M10 tasks.

## QA-03 review outcome

No new release-blocking risk was discovered. `R-002` is materially reduced by a
deterministic chaos matrix that retains dirty primary files, untracked user
files, conflicting worktree commits, stale leases, hash-drifted artifacts,
ownership-swapped run roots, symlink-swapped cleanup targets, and unrelated
processes. Process timeout escalation killed only the owned group while
draining partial output; crash streams and ambiguous recovery evidence remained
inspectable.

The matrix exposed two fail-closed gaps. Complete malformed event/index evidence
previously aborted recovery without a run-level inspection result, and cleanup
did not compare the execution-time owner against the planned run ID. Recovery
now returns `needsInspection` without truncating complete malformed bytes, while
cleanup revalidates owner identity and all non-worktree targets before any
deletion. Real device exhaustion, power loss at every write boundary, PID reuse,
privileged hostile processes, and malicious-repository cases remain explicit
residuals for operational documentation and `QA-06`; worktrees are still not a
sandbox.

## QA-04 review outcome

`R-001` remains high-likelihood/high-impact because vendor CLIs continue to
release independently, but the current mitigation is now executable rather than
single-version prose. Exact official Pi 0.81.0/0.81.1, Claude Code
2.1.104/2.1.218, and Codex 0.145.0 binaries exposed every version/help/auth and
structured-mode flag PatchRace invokes. Six minimum/current deterministic
profiles completed the same raw-first task/normalization contract, and
too-old/newer/malformed/auth/timeout/cancellation cases remained explicit.

The audit rejected the former Claude Code 2.1.0 floor because that binary has
print `stream-json` but no `auth status` command. The floor is now 2.1.104
instead of degrading silently. The selected PATH Codex is still a broken
0.120.0 wrapper and correctly reports unavailable with repair remediation; its
healthy bundled peer is not silently substituted. No live Agent or auth-state
probe was needed. Future minor lines and provider-side changes remain unproven
until the matrix is intentionally rerun.

## QA-05 review outcome

No performance or resource release blocker was found on the reference
macOS/arm64 Node 22 machine. Scheduler and process-runner samples remained far
inside the absolute two-second per-trial branch, ready-job concurrency scaled
without exceeding the declared active count, a 100,000-event trajectory
retained exactly the 10,000-event presentation limit, and a 51.35 MiB normalized
report rendered well inside the ten-second gate.

The report worker peaked at about 485 MiB RSS, below but materially close to the
750 MiB allowance. Normalized JSON plus HTML retained 102.47 MiB; raw streams,
sessions, patches, grades, and repeated variants are excluded from that figure.
The whole-document renderer and 2 GiB default disk budget therefore remain
visible constraints, with explicit rebenchmark triggers. `R-007` is not closed:
real model cost, provider accounting uncertainty, and useful-cycle economics
require authorized dogfood evidence.

## QA-06 review outcome

No unresolved critical or high security defect is known after the implementation
review. The threat matrix now maps every `T-01..T-15` entry to production
controls, tests, and explicit residuals. Focused malicious fixtures cover
shell-shaped argv, traversal, symlinks, hard links, ownership swaps, corrupted
evidence, hidden-verifier leakage, HTML injection, generated instructions,
cleanup, and unrelated-state preservation. Structural checks found no production
`shell: true` and no install lifecycle scripts; the npm advisory query reported
no known vulnerabilities.

The review found one high-impact issue, `QA06-F01`: append/recovery/ownership
operations could follow an attacker-created final-component link. Owned mutable
files now use `O_NOFOLLOW` and require a regular file with exactly one hard
link. Regression tests prove external targets remain unchanged. `R-002` is
materially reduced but stays open because same-user directory-replacement races,
PID reuse, privileged processes, and abrupt power loss are outside a non-sandbox
host guarantee.

`R-011` also remains open by design. Repository, grader, Agent, and Pi Extension
execution requires explicit authority but still has host-user permissions.
Host-only hidden-verifier integrity remains `unknown`, generated instructions
remain untrusted until validated/promoted, and package advice remains manual.
`R-003` remains open for the independent `QA-07` privacy/redaction fixture
review; `QA-08` will independently repeat final package, license, provenance,
and advisory gates. No provider, credential, Keychain, paid Agent, telemetry,
publication, install, commit, push, or global Pi mutation occurred.

## QA-07 review outcome

No unresolved critical or high privacy defect is known after the dedicated
review. A malicious public-export fixture now proves handling of prompts,
absolute paths, five synthetic credential families, source code, names, email,
IP data, false-positive controls, and an intentionally retained unknown format
across plain, JSON, and HTML encodings. Raw prompt and report bytes remain
unchanged; preview is side-effect free; export is config-hash-bound, confirmed,
create-new, and carries a mandatory residual warning.

The review found and fixed five issues: encoded literals and long cross-chunk
tokens could leak; explicitly configured runtime redaction values were ignored
by the CLI; typed OTLP secret fields were serialized too early; the full local
report exposed patches/paths/trajectories; and export reads used path-based
checks. Redaction now handles reviewed encoded forms and buffers within a hard
limit; CLI values come only from explicitly named environment entries and fail
closed; OTLP redacts typed data; no-follow handles read sources; and only a
separate code/path/trace-free `report/shareable/` projection is exportable.

`R-003` remains open because scanner completeness is not provable. Unknown or
transformed secrets, images, binaries, archives, inferred data, and unreviewed
encodings may survive; the fixture requires one unknown value to remain and
requires the warning. Diagnosis/candidate output remains local-sensitive and is
not labeled shareable. Preview paths are local-sensitive and every publication
still requires user inspection and a separate external action. No provider,
credential store, Keychain, paid Agent, telemetry, upload, publication,
automatic deletion, commit, push, or global Pi mutation occurred.

## QA-08 review outcome

No dependency, license, NOTICE, package-content, or known-advisory release
blocker was found in the unpublished local candidate. All 274 registry-backed
lock entries have integrity, all seven production package
version/integrity/license records matched npm, and `pnpm audit --audit-level
high` reported no known vulnerabilities. Seven production and 244 installed
development package/version pairs passed license policy. Production is limited
to MIT/BSD-3-Clause/ISC dependencies and requires no project NOTICE.

The release packer now enforces an allowlist over all nine tarballs, requires
compiled entries/declarations/maps plus schemas where applicable, verifies
workspace/catalog dependency rewriting, refuses install scripts and forbidden
content, and scans 208 published source maps for embedded source/absolute paths.
Credential/private-path markers, raw artifacts, tests, fixtures, and local
state are excluded. A fresh isolated npm consumer installed all nine local
tarballs with scripts disabled and completed the core CLI flow while preserving
unrelated state.

`R-014` is materially reduced but stays open until `DOC-01` measures a fresh
tester and `LCH-06` proves the actual published install. `R-011` retains upstream
ownership/advisory drift and host-execution residuals. Packages request
provenance, Actions are SHA-pinned, and Changesets binds the nine-package group,
but no signed provenance is claimed: the repository has no commit/remote or
protected publish workflow, versions remain `0.0.0`, and namespace/OIDC/tag/
post-publication checks remain M11 blockers. No credential, provider, paid
Agent, publish, signing, tag, commit, push, telemetry, or global Pi mutation
occurred.

## DOC-01 review outcome

`R-014` is reduced by a reproducible fresh-source measurement: a repository
copy without dependencies or build output completed frozen installation in
1.343 seconds and reached a valid two-trial comparison in another 5.699 seconds
(7.244 seconds total) on the maintained reference machine. The default path
requires only the supported Node/pnpm/Git stack and deterministic local fixture;
it does not require Python, an Agent CLI, provider authentication, or network
access after dependency installation.

This single-machine result is not a general latency claim. Registry speed,
machine load, platform, and later published-package resolution can differ, so
`R-014` remains open until the actual published install is verified in
`LCH-06`. The retained quickstart report is local-sensitive and is not evidence
of live Agent quality. No provider, credential store, paid Agent, telemetry,
publication, commit, push, or global Pi mutation occurred.

## DOC-02 review outcome

`R-008` is reduced by a single user-facing methodology that binds every result
to exact task/variant/attempt identity, separates model, harness, and workflow
comparisons, puts valid hard gates before secondary metrics, defines `pass@k`
and `pass^k` limitations, and makes evidence tiers and unsupported claims
explicit. It also documents the observable-only trace boundary and requires
`unknown` when evidence is incomplete or confounded.

Documentation cannot make a small or biased suite representative. `R-008`
therefore remains open through dogfood, beta, and the release-candidate review.
No algorithm, threshold, runtime behavior, dependency, provider call,
credential access, publication, commit, push, or global Pi mutation changed.

## DOC-03 review outcome

`R-002`, `R-003`, and `R-011` now have one operational user guide that makes
the non-sandbox host authority, local-sensitive retention, repository/package/
Agent/Pi-resource trust, export/redaction limits, preview-first exact cleanup,
recovery, and incident-preservation behavior explicit. It also states that the
pre-publication repository has no real private reporting endpoint rather than
inventing one; `LCH-04` remains a public-release blocker.

The guide does not reduce same-user host races, unknown secret formats,
upstream compromise, or disclosure already made to a vendor/manual
destination. Those risks remain open. No runtime behavior, dependency,
provider, credential, publication, destructive cleanup, commit, push, or global
Pi state changed.

## DOC-04 review outcome

`R-001` and `R-006` now include source-contributor procedures for public
adapter/grader contracts, version drift, raw-first evidence, unavailable
semantics, process ownership, deterministic task discrimination, hidden
verifiers, negative fixtures, and unrelated-state preservation. The guides
state that v0.1 has no runtime third-party adapter/grader discovery, so an
interface implementation is not misrepresented as an automatically loadable
plugin.

Documentation cannot prevent future vendor drift or provide enforced host
isolation. Those risks remain open. No public contract, runtime behavior,
dependency, provider, credential, publication, commit, push, or global Pi state
changed.

## DOC-05 review outcome

Three public-safe repositories now demonstrate real deterministic command and
hard-gate comparisons for TypeScript, Python, and POSIX shell. The checked
teaching example also demonstrates protected training/validation/holdout
separation, one mutation, a frozen one-time final gate, and no retuning.
`R-005` is reduced by prominent harness/fixture claim boundaries and by keeping
promotion as a recommendation rather than activation.

These synthetic harnesses and public solutions do not establish live Agent
quality, hidden-verifier secrecy, or transfer to arbitrary repositories.
`R-005` remains open for representative dogfood/beta evidence. No provider,
credential, network, telemetry, publication, commit, push, or global Pi state
was used.

## BETA-01 review outcome

Fifty-five real compiled-CLI races exercised ten tasks and all three launch
adapter implementations through deterministic structured fixtures. Fifty
passed end to end, five valid hard-gate failures were classified as expected
Agent failures, all produced readable evidence, 55 exact cleanups preserved
unrelated state, and zero orphaned worktrees remained. Ten maintained
interruption/recovery/cleanup classes and five teaching cycles—including three
required rejections—passed.

This materially reduces lifecycle/reliability uncertainty but does not close
`R-007` or `R-005`: no vendor model or representative provider cost was
measured. The evidence and docs force those fields to false/unavailable rather
than inferring them. No provider, credential, network, paid call, telemetry,
publication, commit, push, or global Pi mutation occurred.

## BETA-02 blocked review

`R-017` is now explicit. The private-beta protocol, independent-participant
rule, no-intervention guide, privacy-minimized record schema, local collection,
failure classification, activation/understanding/repeat-use metrics, and
machine verifier are ready. Its isolated self-test proves five eligible records
compute the expected seven gates and median/p90, while fewer-than-five, sample,
implementation-author, duplicate-ID, and sensitive-contact-data cases fail.
The verifier rejects samples, implementation authors, duplicates, unsafe data,
unclassified failures, and fewer than five participants.

No eligible participant evidence exists (0/5), so `BETA-02` is blocked rather
than represented by synthetic users. `BETA-03` and `QA-09` remain
dependency-blocked. No participant contact data, provider, credential, network,
paid call, telemetry, publication, commit, push, or global Pi state was used.

## ADR-022 preview-waiver review

At the owner's direction, `ADR-022` drops `BETA-02` and `BETA-03` from the
pre-publication path for a source-only `v0.1.0-rc.1` GitHub preview. This
changes the launch claim, not the evidence: independent-user beta remains 0/5,
activation and comprehension are unvalidated, and no synthetic record is
created. `R-017` is therefore accepted only for the preview and remains
release-blocking for a stable or npm publication.

The waiver does not cover data loss, unrelated cleanup, credential leakage,
unsafe generated-artifact activation, invalid grading, holdout leakage,
security/privacy defects, documentation failures, or package-content defects.
Any such finding still delays publication. Owner use and public-preview
feedback become the immediate discovery path, with the existing beta protocol
retained for later independent validation.
