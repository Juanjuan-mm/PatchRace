# Canonical Task Ledger

Last updated: 2026-07-23

This is the authoritative list of project tasks. Stable IDs must not be reused. New tasks are appended within the appropriate milestone using the next available suffix.

Statuses: `TODO`, `NEXT`, `DOING`, `BLOCKED`, `DONE`, `DROPPED`.

Priorities: `P0` blocks the release path, `P1` is important for v0.1 quality, `P2` is optional or deferrable.

## Operations

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `OPS-001` | P0 | Establish project-control records | — | Brief, execution plan, task ledger, progress, decisions, risks, maintenance protocol, and session log exist and cross-link correctly. | DONE |
| `OPS-002` | P0 | Reconcile the repository agent contract | `OPS-001` | Root `AGENTS.md` is read by fixed path and audited against control, architecture, security, implementation, and verification records; discovered drift is fixed and the applicable local gates pass without credentialed or paid calls. | DONE |

## M0 — Product foundation

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `F0-01` | P0 | Review and freeze the MVP product brief | `OPS-001` | Primary persona, promise, required scope, deferred scope, boundaries, and vocabulary are explicitly approved; brief status becomes accepted. | DONE |
| `F0-02` | P0 | Verify project and package naming | `F0-01` | Search GitHub, npm, domains, and obvious trademarks for `PatchRace`, CLI, and Pi package names; record selected names and fallbacks. | DONE |
| `F0-03` | P0 | Select license and governance model | `F0-01` | License choice, copyright holder, contribution terms, code of conduct policy, and maintainer model are documented. | DONE |
| `F0-04` | P1 | Define public positioning and competitor boundary | `F0-01` | One-page comparison against EvoSkill, GEPA, Stet, Qwen Arena, and generic eval harnesses; claims are evidence-backed and non-misleading. | DONE |
| `F0-05` | P0 | Freeze v0.1 success and stop criteria | `F0-01` | Quantified activation, reliability, dogfood, beta, performance, security, and launch criteria are approved. | DONE |
| `F0-06` | P0 | Establish initial threat and privacy boundaries | `F0-01` | Data inventory, trust boundaries, destructive-operation rules, trace/privacy policy, and generated-artifact policy are documented. | DONE |
| `F0-07` | P1 | Define launch personas and top workflows | `F0-01` | Three personas and five ranked end-to-end jobs are written with entry condition, desired outcome, and failure modes. | DONE |
| `F0-08` | P0 | M0 milestone review | `F0-02..F0-07` | All M0 decisions are internally consistent; open questions are resolved or explicitly deferred. | DONE |

## M1 — Architecture and technical feasibility

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `ARC-01` | P0 | Write system architecture RFC | `F0-08` | Components, data flow, process boundaries, storage layout, extension points, failure handling, and deployment model are specified. | DONE |
| `ARC-02` | P0 | Specify CLI commands and configuration schema | `ARC-01` | `init`, `mine`, `run/race`, `report`, `diagnose`, `teach`, `promote`, `rollback`, `doctor`, and `clean` flows have examples and exit semantics. | DONE |
| `ARC-03` | P0 | Specify immutable run-artifact format | `ARC-01` | Run IDs, manifests, logs, patches, grades, metrics, provenance, hashes, and schema-version rules are defined. | DONE |
| `ARC-04` | P0 | Specify normalized trace schema | `ARC-01` | Observable event taxonomy and mappings for file, search, command, edit, test, tool error, timing, token, cost, and final-result events are defined. | DONE |
| `ARC-05` | P0 | Specify agent-adapter contract | `ARC-02..ARC-04` | Capability discovery, invocation, streaming, cancellation, auth, version detection, metrics, and error normalization have a testable interface. | DONE |
| `ARC-06` | P0 | Specify task and grader contracts | `ARC-01`, `ARC-03` | Task baseline, setup, instruction, hidden verifier, assertions, budgets, results, and grader isolation are defined. | DONE |
| `ARC-07` | P0 | Specify Pi candidate and optimizer contracts | `ARC-01`, `ARC-04`, `ARC-06` | Diagnoses, evidence citations, mutation types, ablations, objective vectors, candidate lineage, and promotion decisions are defined. | DONE |
| `SPIKE-01` | P0 | Prove Pi headless and SDK integration | `ARC-05` | A disposable spike runs Pi with isolated resources, captures events/session data, cancels safely, and records version/auth behavior. | DONE |
| `SPIKE-02` | P0 | Prove Claude Code headless integration | `ARC-05` | A disposable spike runs a fixture task, captures structured output available to the user, cancels safely, and records version/auth behavior. | DONE |
| `SPIKE-03` | P0 | Prove Codex headless integration | `ARC-05` | Same acceptance as `SPIKE-02` for Codex. | DONE |
| `SPIKE-04` | P0 | Prove safe Git worktree lifecycle | `ARC-01` | Create, seed, run, interrupt, inspect, retain, and clean fixture worktrees without modifying unrelated repo state. | DONE |
| `SPIKE-05` | P1 | Prove historical task reconstruction | `ARC-06` | At least three real commits/PR-shaped fixtures can reset to a parent, inject held-back tests after execution, and grade a patch. | DONE |
| `SPIKE-06` | P1 | Prototype trace differential and diagnosis | `ARC-04`, `ARC-07` | Two contrasting traces produce file/command/test-order differences and an evidence-linked diagnosis. | DONE |
| `ARC-08` | P0 | Decide implementation stack and dependency policy | `SPIKE-01..SPIKE-06` | Node/TypeScript versions, package manager, test framework, UI/report stack, optional Python bridge policy, and dependency rules are recorded. | DONE |
| `ARC-09` | P0 | M1 architecture review | `ARC-01..ARC-08`, `SPIKE-01..SPIKE-06` | Critical risks have mitigations, contracts match spike evidence, and no unresolved feasibility blocker remains. | DONE |

## M2 — Development foundation

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `DEV-01` | P0 | Scaffold TypeScript monorepo | `ARC-09` | Workspace packages, shared tsconfig, package scripts, build graph, and supported runtime constraints install and build from clean checkout. | DONE |
| `DEV-02` | P0 | Configure formatting, linting, type checking, and tests | `DEV-01` | One documented command runs all local quality gates; intentional failures are caught in fixtures. | DONE |
| `DEV-03` | P0 | Add CI foundation | `DEV-02` | Pull-request CI runs install, lint, typecheck, unit tests, and build with dependency caching on supported runners. | DONE |
| `DEV-04` | P0 | Create test fixture repositories | `DEV-01` | Small deterministic TypeScript and Python repositories cover success, failure, dirty state, hidden test, timeout, and conflicting patch cases. | DONE |
| `DEV-05` | P0 | Implement CLI skeleton and error conventions | `DEV-01`, `ARC-02` | All v0.1 commands parse, expose help, return documented exit codes, and route to placeholder services without hidden side effects. | DONE |
| `DEV-06` | P1 | Establish logging and diagnostics conventions | `DEV-01`, `ARC-03` | Human progress goes to stderr, machine output is stable, secrets are maskable, and debug bundles are structured. | DONE |
| `DEV-07` | P1 | Establish contributor workflow | `DEV-02` | CONTRIBUTING draft, development setup, test conventions, commit/release policy, and task-record update rules are usable from clean checkout. | DONE |
| `DEV-08` | P1 | Add release and versioning skeleton | `DEV-01` | Changesets or selected equivalent can version packages, generate changelogs, and produce dry-run tarballs without publishing. | DONE |
| `DEV-09` | P1 | Add dependency and supply-chain checks | `DEV-03` | Lockfile policy, audit/signature checks where supported, license inventory, and automated dependency updates are configured. | DONE |
| `DEV-10` | P0 | M2 foundation review | `DEV-01..DEV-09` | Clean checkout setup and CI succeed; fixtures and release dry run are reproducible. | DONE |

## M3 — Reproducible execution core

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `CORE-01` | P0 | Implement suite configuration loader | `DEV-10`, `ARC-02`, `ARC-06` | Versioned YAML/JSON config validates with actionable path-level errors and stable normalized output. | DONE |
| `CORE-02` | P0 | Implement run identity, manifest, and artifact store | `DEV-10`, `ARC-03` | Runs are content/provenance-addressed as designed, append safely, and remain inspectable after interruption. | DONE |
| `CORE-03` | P0 | Implement safe worktree manager | `DEV-04`, `SPIKE-04` | Worktrees are created sequentially, validated, retained/cleaned explicitly, and never collide with existing branches/worktrees. | DONE |
| `CORE-04` | P0 | Implement subprocess lifecycle runner | `CORE-02` | Streams output, captures exit data, propagates environment intentionally, terminates process groups, and survives common signals. | DONE |
| `CORE-05` | P0 | Implement scheduler and concurrency control | `CORE-03`, `CORE-04` | Setup is lock-safe, ready jobs run concurrently within limits, and failures do not corrupt other jobs. | DONE |
| `CORE-06` | P0 | Implement time, run, token, and cost budgets | `CORE-04`, `CORE-05` | Supported budgets stop or reject work predictably and are represented in results. | DONE |
| `CORE-07` | P0 | Implement cancellation, checkpoints, and resume | `CORE-02`, `CORE-05` | Interrupted fixtures resume idempotently or explain why they cannot; no completed result is duplicated. | DONE |
| `CORE-08` | P0 | Implement secret redaction pipeline | `DEV-06`, `CORE-02` | Known token patterns, configurable values, paths, prompts, and outputs can be redacted before export; tests include false-positive controls. | DONE |
| `CORE-09` | P1 | Implement `doctor` environment inspection | `CORE-01` | Reports Git/runtime/CLI versions, missing capabilities, auth readiness without revealing secrets, and actionable fixes. | DONE |
| `CORE-10` | P1 | Implement explicit and safe cleanup | `CORE-03`, `CORE-07` | Dry run lists exact targets; cleanup refuses broad/unresolved paths and preserves evidence according to retention policy. | DONE |
| `CORE-11` | P0 | Core end-to-end fixture test | `CORE-01..CORE-10` | A fixture task runs through prepare, execute, interrupt/resume, artifact inspection, and cleanup on CI. | DONE |
| `CORE-12` | P0 | M3 execution-core review | `CORE-11` | Reproducibility, destructive-action, recovery, and artifact gates pass. | DONE |

## M4 — Agent adapter layer

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `ADP-01` | P0 | Implement Pi CLI adapter | `CORE-12`, `SPIKE-01` | Runs configured Pi model/resources headlessly, streams events, captures session/artifacts, cancels, and reports capability/version data. | DONE |
| `ADP-02` | P1 | Implement Pi SDK execution path | `ADP-01` | SDK path can inject isolated candidate resources and produces results compatible with CLI path; documented fallback exists. | DONE |
| `ADP-03` | P0 | Implement Pi trace normalization | `ADP-01`, `ARC-04` | Representative Pi sessions map deterministically to normalized observable events with provenance. | DONE |
| `ADP-04` | P0 | Implement Claude Code adapter | `CORE-12`, `SPIKE-02` | Meets the agent-adapter contract using the locally installed/authenticated CLI without token extraction. | DONE |
| `ADP-05` | P0 | Implement Codex adapter | `CORE-12`, `SPIKE-03` | Meets the same contract and safety constraints as `ADP-04`. | DONE |
| `ADP-06` | P0 | Normalize Claude and Codex traces | `ADP-04`, `ADP-05` | Available observable events map to the shared schema; unsupported fields are explicit rather than fabricated. | DONE |
| `ADP-07` | P0 | Build shared adapter contract suite | `ADP-01..ADP-06` | All adapters pass invocation, streaming, timeout, cancellation, malformed output, unavailable auth, and version-reporting tests. | DONE |
| `ADP-08` | P1 | Add adapter compatibility matrix | `ADP-07` | Supported CLI version ranges and known degradations are machine-tested and documented; unsupported versions fail clearly. | DONE |
| `ADP-09` | P1 | Add optional standard trace export | `ADP-03`, `ADP-06`, `CORE-08` | Redacted opt-in export conforms to the selected public trace format and never publishes automatically. | DONE |
| `ADP-10` | P0 | M4 adapter review | `ADP-07..ADP-09` | Three adapters complete the same fixture with comparable provenance and no auth/privacy violations. | DONE |

## M5 — Tasks and grading

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `EVAL-01` | P0 | Implement versioned task format | `CORE-12`, `ARC-06` | Task instructions, baseline, setup, verifier, assertions, metadata, and provenance serialize and validate. | DONE |
| `EVAL-02` | P0 | Implement manual suite initialization | `EVAL-01` | `init` creates an editable working suite and verifies it without invoking an agent. | DONE |
| `EVAL-03` | P0 | Implement deterministic command/test grader | `EVAL-01`, `CORE-04` | Setup/build/test/lint/typecheck commands run outside agent control and produce structured evidence. | DONE |
| `EVAL-04` | P0 | Implement file, diff, and repository assertions | `EVAL-01` | Required/forbidden paths, change counts, dependency changes, repo cleanliness, and patch-size limits are enforced. | DONE |
| `EVAL-05` | P0 | Implement hidden verifier injection | `EVAL-03`, `CORE-03` | Held-back test patches or verifier assets are unavailable during the agent run and applied only by the grader. | DONE |
| `EVAL-06` | P0 | Implement local Git-history task miner | `EVAL-01`, `SPIKE-05` | Selects candidate commits, reconstructs parent state, extracts metadata/diffs/tests, filters unsuitable changes, and requires user review. | DONE |
| `EVAL-07` | P1 | Add optional GitHub PR/issue metadata miner | `EVAL-06` | Uses user-controlled `gh` authentication, caches provenance, handles unavailable metadata, and never requires GitHub for local tasks. | DONE |
| `EVAL-08` | P0 | Implement train/validation/holdout split | `EVAL-01`, `EVAL-06` | Deterministic, category-aware splits prevent final holdout use during candidate generation and record split hashes. | DONE |
| `EVAL-09` | P1 | Detect flaky or invalid tasks | `EVAL-03`, `EVAL-06` | Baseline/replay checks flag nondeterministic setup, impossible verifier, leaked solution, or environment-dependent tasks. | DONE |
| `EVAL-10` | P0 | Implement leakage and grader-integrity checks | `EVAL-05`, `EVAL-08` | Agent cannot modify scoring config or see hidden assets; violations are explicit failures with evidence. | DONE |
| `EVAL-11` | P1 | Add repeated-run statistics | `EVAL-03` | Reports success rate, pass@k/pass^k as selected, variance, failure categories, and confidence caveats without overstating small samples. | DONE |
| `EVAL-12` | P0 | Build replay reference suite | `EVAL-02..EVAL-11` | At least ten curated tasks across fixture ecosystems exercise grading, mining, hidden verification, splitting, and flake handling. | DONE |
| `EVAL-13` | P0 | M5 task/grading review | `EVAL-12` | Reference tasks replay reproducibly and the holdout/leakage gates pass. | DONE |

## M6 — Comparison product

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `CMP-01` | P0 | Implement race orchestration | `ADP-10`, `EVAL-13` | Same task/snapshot runs across selected variants with explicit distinction between model, harness, and workflow comparisons. | DONE |
| `CMP-02` | P0 | Implement correctness-first ranking policy | `CMP-01` | Hard gates precede stability, cost, latency, and footprint; policy is configurable and raw dimensions remain visible. | DONE |
| `CMP-03` | P1 | Implement terminal progress view | `CMP-01` | Live status is readable, non-destructive, interruptible, and separable from machine output. | DONE |
| `CMP-04` | P0 | Implement static HTML report | `CMP-01`, `CMP-02` | Standalone report renders overview, gates, metrics, evidence, caveats, provenance, and links without a server. | DONE |
| `CMP-05` | P0 | Implement side-by-side patch comparison | `CMP-04` | Users can inspect changed files, unified/side-by-side diffs, protected-path violations, and human reference patch when allowed. | DONE |
| `CMP-06` | P1 | Implement normalized trajectory timeline | `CMP-04`, `ADP-03`, `ADP-06` | Report aligns observable reads/searches/commands/edits/tests/errors while labeling missing vendor data. | DONE |
| `CMP-07` | P1 | Add machine-readable report formats | `CMP-01` | Stable JSON plus selected CI formats support automation without scraping HTML. | DONE |
| `CMP-08` | P0 | Implement baseline and regression comparison | `CMP-02` | A stored baseline can be compared to a candidate with explicit promote/hold/reject inputs and schema migration behavior. | DONE |
| `CMP-09` | P1 | Add shareable, redacted report workflow | `CMP-04`, `CORE-08` | Export preview shows redactions and requires explicit destination/confirmation; private raw artifacts remain local. | DONE |
| `CMP-10` | P0 | Produce first reproducible three-agent demo | `CMP-01..CMP-09` | Public-safe fixture race can be reproduced from clean checkout and yields a checked report artifact. | DONE |
| `CMP-11` | P0 | M6 comparison review | `CMP-10` | Comparison is useful without optimization, evidence is auditable, and no universal-best claim is implied. | DONE |

## M7 — Explainable diagnosis

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `DIA-01` | P0 | Freeze Pi failure taxonomy | `CMP-11`, `SPIKE-06` | Discovery, context, workflow, tool, verification, capability, and unknown categories have definitions, examples, and non-overlap guidance. | DONE |
| `DIA-02` | P0 | Extract deterministic trajectory features | `DIA-01`, `CMP-06` | File coverage, search loops, command failures, time-to-test, test order, edit footprint, retries, and relevant deltas are computed reproducibly. | DONE |
| `DIA-03` | P0 | Implement cross-agent trajectory alignment | `DIA-02` | Aligns semantically comparable observable actions without assuming identical tools or exposing hidden reasoning. | DONE |
| `DIA-04` | P0 | Implement rule-based failure diagnosis | `DIA-02`, `EVAL-03`, `EVAL-04` | High-confidence diagnoses cite exact events, files, commands, or grader results and expose confidence/limitations. | DONE |
| `DIA-05` | P1 | Implement reflective diagnosis provider | `DIA-03`, `DIA-04` | Optional LLM reflection consumes redacted evidence, returns schema-valid hypotheses, and cannot override deterministic facts. | DONE |
| `DIA-06` | P0 | Distinguish likely workflow and capability gaps | `DIA-04`, `DIA-05` | Conservative classifier can recommend no configuration mutation when evidence points to model capability or insufficient data. | DONE |
| `DIA-07` | P0 | Implement evidence-linked diagnosis report | `DIA-03..DIA-06` | Each finding includes category, confidence, evidence, alternative explanations, and appropriate mutation targets. | DONE |
| `DIA-08` | P1 | Validate diagnosis quality on labeled cases | `DIA-07` | Maintainer-labeled fixture set measures precision/coverage; unsafe or speculative diagnoses are identified. | DONE |
| `DIA-09` | P0 | M7 diagnosis review | `DIA-08` | Diagnosis demonstrates actionable value beyond raw comparison and meets agreed precision threshold. | DONE |

## M8 — Pi teaching loop

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `TCH-01` | P0 | Inventory and lint current Pi resources | `DIA-09` | Reads project-local/global context without mutation, maps origin/precedence, counts context cost, and detects selected config smells/conflicts. | DONE |
| `TCH-02` | P0 | Implement diagnosis-to-mutation routing | `DIA-07`, `TCH-01` | Stable fact → context file, procedural gap → skill, invoked workflow → prompt, missing tool → recommendation, capability gap → model advice. | DONE |
| `TCH-03` | P0 | Implement candidate format and lineage | `ARC-07`, `TCH-02` | Candidate records parent, diagnoses, evidence, exact files, objective, generator, config hash, and evaluation history. | DONE |
| `TCH-04` | P0 | Implement safe candidate staging | `TCH-03` | Candidates are isolated in explicit directories/branches, diffable, never auto-activated globally, and cleanly disposable. | DONE |
| `TCH-05` | P0 | Generate focused `AGENTS.md` candidates | `TCH-02..TCH-04` | Proposals remove bloat/conflicts or add stable project facts; every change has evidence and token-cost delta. | DONE |
| `TCH-06` | P0 | Generate Pi skill candidates | `TCH-02..TCH-04` | Valid, narrowly triggered `SKILL.md` candidates encode repeatable workflows, avoid project/version leakage, and contain no unreviewed executable payload. | DONE |
| `TCH-07` | P0 | Generate prompt-template candidates | `TCH-02..TCH-04` | Valid project-local prompts cover user-invoked repeatable workflows with documented arguments and evidence. | DONE |
| `TCH-08` | P1 | Generate settings/model/tool recommendations | `TCH-02..TCH-04` | Recommendations are diffable, capability-aware, and never install packages or expose credentials automatically. | DONE |
| `TCH-09` | P0 | Implement candidate review UI | `TCH-05..TCH-08` | User sees source diagnosis, exact diff, security flags, expected effect, cost, and approve/reject controls before validation/activation. | DONE |
| `TCH-10` | P0 | Implement one-variable ablation runner | `TCH-04`, `CMP-08` | Baseline and candidate differ by one declared mutation set; contamination and hidden extra changes fail validation. | DONE |
| `TCH-11` | P0 | Enforce train/validation/holdout protocol | `TCH-10`, `EVAL-08` | Candidate generation cannot inspect holdout results; final holdout usage is logged and protected from repeated tuning. | DONE |
| `TCH-12` | P1 | Implement budgeted successive halving | `TCH-10` | Weak candidates are cheaply screened; survivors receive more tasks/runs within explicit run/cost/time budgets. | DONE |
| `TCH-13` | P1 | Implement Pareto candidate selection | `TCH-11`, `TCH-12` | Correctness, stability, cost, latency, footprint, and config complexity remain separate; selection rationale is explainable. | DONE |
| `TCH-14` | P0 | Implement promote and rollback | `TCH-09`, `TCH-11`, `TCH-13` | Promotion applies only approved project-local diffs, records provenance, supports dry run, and rollback restores the exact prior state. | DONE |
| `TCH-15` | P0 | Implement `patchrace teach pi` end-to-end | `TCH-01..TCH-14` | One command can diagnose, propose, screen, validate, report, and request promotion within budget, while allowing each phase to run separately. | DONE |
| `TCH-16` | P0 | Demonstrate held-out Pi improvement | `TCH-15` | A reproducible non-trivial demo improves a predeclared held-out metric without correctness, safety, or allowed-budget regression. | DONE |
| `TCH-17` | P0 | M8 teaching-loop review | `TCH-16` | Review confirms no data leakage, overclaiming, silent activation, or hidden aggregate-score manipulation. | DONE |

## M9 — Pi-native UX

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `PI-01` | P0 | Scaffold Pi extension package | `TCH-17` | Package follows current Pi conventions, loads project-locally, hot reloads in development, and delegates to the stable core. | DONE |
| `PI-02` | P0 | Add Pi race command | `PI-01`, `CMP-01` | Pi user can configure/start/inspect a race without losing the current session; risky actions require confirmation. | DONE |
| `PI-03` | P0 | Add Pi coach/diagnose command | `PI-01`, `DIA-07` | Shows evidence-linked findings and clearly separates deterministic facts from inferred hypotheses. | DONE |
| `PI-04` | P0 | Add candidate review and promotion command | `PI-01`, `TCH-09`, `TCH-14` | Pi TUI shows exact candidate diff, validation evidence, safety flags, and explicit approve/reject/rollback actions. | DONE |
| `PI-05` | P1 | Add run status and report navigation | `PI-01`, `CMP-04` | User can resume status, open artifacts, and navigate reports after restart or compaction. | DONE |
| `PI-06` | P1 | Package-install and update compatibility tests | `PI-01` | Local/git/npm dry-run installs, project scope, resource filtering, reload, update, and uninstall leave expected state. | DONE |
| `PI-07` | P0 | M9 Pi UX review | `PI-02..PI-06` | A Pi user completes race → diagnosis → candidate review → promote/rollback through documented flows. | DONE |

## M10 — Release hardening and beta

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `QA-01` | P0 | Complete automated test pyramid | `PI-07` | Unit, contract, integration, E2E, fixture, and snapshot coverage meets frozen targets and avoids meaningless percentage chasing. | DONE |
| `QA-02` | P0 | Validate supported macOS and Linux environments | `QA-01` | Clean install and core flows pass on supported Node/Git/CLI matrix; platform limitations are documented. | DONE |
| `QA-03` | P0 | Run worktree and process chaos tests | `CORE-12`, `QA-01` | Dirty repo, signals, crashes, stale locks, disk pressure, partial artifacts, conflicting branches, and cleanup failures preserve user data. | DONE |
| `QA-04` | P0 | Run agent CLI compatibility tests | `ADP-08`, `QA-01` | Selected current and minimum versions pass; drift failures produce actionable degradation rather than corrupted results. | DONE |
| `QA-05` | P1 | Benchmark overhead and resource use | `QA-01` | Runner/report overhead, disk retention, concurrency, and large-trace behavior meet frozen budgets or have documented limits. | DONE |
| `QA-06` | P0 | Complete security review and threat model | `F0-06`, `QA-03` | Command injection, path traversal, symlink, malicious repo, secret, generated-skill, package, and cleanup threats have tests/mitigations. | DONE |
| `QA-07` | P0 | Complete privacy and redaction review | `CORE-08`, `ADP-09`, `CMP-09` | Public export fixtures prove prompts, paths, credentials, code, and personal data are handled according to policy; limitations are prominent. | DONE |
| `QA-08` | P0 | Complete dependency/license/release audit | `DEV-09` | Dependency licenses, notices, provenance, lockfile, package contents, and published tarballs are reviewed. | DONE |
| `DOC-01` | P0 | Write installation and five-minute quickstart | `PI-07` | A fresh tester follows it without maintainer help and reaches a valid report. | DONE |
| `DOC-02` | P0 | Write concepts and methodology documentation | `TCH-17` | Explains comparison axes, correctness gates, repeated runs, trace limits, failure taxonomy, optimization, holdout, and claims. | DONE |
| `DOC-03` | P0 | Write security, privacy, and cleanup documentation | `QA-06`, `QA-07` | Trust model, local data, package/skill risks, publication, exact cleanup behavior, and incident reporting are clear. | DONE |
| `DOC-04` | P1 | Write adapter and grader contributor guides | `ADP-10`, `EVAL-13` | External contributor can add a fixture-backed adapter or grader using public contracts. | DONE |
| `DOC-05` | P0 | Build realistic examples | `DOC-01`, `TCH-16` | TypeScript, Python, and one additional ecosystem demonstrate compare; at least one demonstrates teach/holdout. | DONE |
| `BETA-01` | P0 | Complete at least 50 dogfood runs | `QA-02..QA-07`, `DOC-05` | Runs cover success/failure/interruption/three agents/teaching; issue log and reliability metrics are recorded. | DONE |
| `BETA-02` | P0 | Run private beta with target users | `BETA-01` | At least five target users attempt onboarding; activation time, failures, qualitative feedback, and repeat-use intent are recorded. Dropped from the pre-publication path by `ADR-022`; 0/5 is retained as an unvalidated preview limitation, not a pass. | DROPPED |
| `BETA-03` | P0 | Close release-blocking beta issues | `BETA-02` | All P0/P1 launch blockers are fixed, explicitly deferred with rationale, or cause launch delay. Dropped with its evidence-producing dependency by `ADR-022`; owner testing and public-preview feedback move to the post-publication response path. | DROPPED |
| `QA-09` | P0 | M10 release-candidate review | `QA-01..QA-08`, `DOC-01..DOC-05`, `BETA-01`, `ADR-022` | Versioned source-only release candidate passes product, correctness, safety, documentation, dogfood, and package-content gates; the independent-user waiver and preview-only claims are verified. | DONE |

## M11 — Public GitHub launch

| ID | Pri | Task | Dependencies | Deliverable and acceptance | Status |
|---|---|---|---|---|---|
| `LCH-01` | P0 | Reconfirm names and public namespaces | `F0-02`, `QA-09` | GitHub org/repo, npm packages, executable, social handles/domain if used, and fallback names are secured or documented. | DONE |
| `LCH-02` | P1 | Produce brand and demo assets | `LCH-01`, `DOC-05` | Logo/banner, terminal recording, screenshots, report preview, and accessible alt text match real product behavior. | TODO |
| `LCH-03` | P0 | Finalize GitHub README | `DOC-01..DOC-05`, `LCH-02` | First screen explains value in ten seconds; install, GIF, use cases, evidence, limitations, architecture, roadmap, and contribution links are accurate. | TODO |
| `LCH-04` | P0 | Configure public repository operations | `F0-03`, `LCH-03` | LICENSE, notices, code of conduct decision, security policy, issue/PR templates, labels, discussions, branch protection, and CI are ready. | TODO |
| `LCH-05` | P0 | Finalize changelog and v0.1 release notes | `QA-09` | Features, compatibility, known limitations, migration promises, security caveats, and reproducible demo are recorded. | TODO |
| `LCH-06` | P0 | Publish core CLI packages | `LCH-01`, `LCH-04`, `LCH-05` | npm packages install from clean environment, provenance/contents are correct, and version/tag match. | TODO |
| `LCH-07` | P0 | Publish Pi package | `LCH-06`, `PI-06` | `pi install` succeeds in supported scope, catalog metadata is correct, and uninstall/update are verified. | TODO |
| `LCH-08` | P0 | Create GitHub v0.1.0 release | `LCH-06`, `LCH-07` | Signed/verified release as selected, tags, artifacts, checksums/provenance, notes, and links are public and tested. | TODO |
| `LCH-09` | P0 | Publish reproducible demo report | `LCH-08`, `TCH-16` | Public artifact demonstrates race → diagnose → teach → held-out validation with commands, raw safe evidence, and caveats. | TODO |
| `LCH-10` | P1 | Publish launch article and comparison narrative | `LCH-09` | Article focuses on the problem and reproducible evidence, fairly cites adjacent projects, and avoids unsupported superiority claims. | TODO |
| `LCH-11` | P1 | Execute community launch schedule | `LCH-10` | Pi community, relevant coding-agent communities, HN/Reddit/X/Chinese channels are scheduled with channel-appropriate, non-spam messaging. | TODO |
| `LCH-12` | P0 | Operate first 72-hour response window | `LCH-08..LCH-11` | Install breakages and security issues are triaged quickly; duplicates are consolidated; feedback and activation metrics are logged. | TODO |
| `LCH-13` | P0 | Close launch milestone and open v0.2 backlog | `LCH-12` | Launch retrospective, actual metrics, unresolved issues, user requests, technical debt, and next milestone recommendations are recorded. | TODO |
| `LCH-14` | P0 | Publish source-only GitHub preview | `QA-09`, `LCH-01`, `ADR-022` | A public repository exposes the reviewed source at exact tag `v0.1.0-rc.1`; README, release notes, security/private-reporting, issue intake, license, and CI are live; a GitHub prerelease is created without npm publication; remote commit/tag and hosted checks are verified. | DOING |

## Post-launch candidates, deliberately outside v0.1

- Optional GEPA/EvoSkill optimizer-engine bridge.
- Generated Extension prototypes inside a hardened sandbox.
- Continuous learning from regular Pi sessions with explicit task/evidence capture.
- Public opt-in benchmark/report registry.
- Team/private hosted result service.
- More adapters, remote runners, container backends, and ecosystem task packs.
