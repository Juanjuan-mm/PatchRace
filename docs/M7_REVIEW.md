# M7 Explainable Diagnosis Review

Status: passed 9/9 tasks  
Reviewed: 2026-07-23

## Exit decision

M7 passes. PatchRace can replay durable normalized trace, result, and grader
artifacts into reproducible trajectory features, align semantically comparable
cross-Agent observable actions, apply conservative deterministic rules, separate
actionable workflow/configuration evidence from likely model capability or
insufficient data, and produce validated evidence-linked JSON/HTML reports.

This is actionable value beyond raw comparison: the user sees a category,
confidence, exact event/gate citations, alternative explanations, limitations,
and safe mutation eligibility rather than only which trial won. Hard gates,
integrity, and unavailable data remain authoritative. The system can explicitly
recommend no configuration mutation.

## Task evidence

| Task | Acceptance evidence |
|---|---|
| `DIA-01` | `taxonomy.ts` and the diagnosis architecture contract freeze all seven categories with examples, exclusions, precedence, capability controls, and an explicit unknown outcome. |
| `DIA-02` | `features.ts` derives relevant-file coverage, search loops, command failures, first-test timing/order, edit footprint, retries, and right-minus-left deltas while preserving unavailable lanes and event citations. |
| `DIA-03` | `alignment.ts` aligns file/list/search/test/command/edit/error actions across different vendor tool surfaces, retains per-trial order/provenance, and excludes observable messages/private intent. |
| `DIA-04` | `rules.ts` freezes deterministic facts, suppresses narrow blame for invalid/unavailable evidence, and emits stable cited findings for tool, verification, discovery, workflow, context, or unknown outcomes. |
| `DIA-05` | `reflection.ts` defines an opt-in redacted provider boundary with strict output/citation validation; hypotheses stay low-confidence, non-promotable, and separate from unchanged facts. |
| `DIA-06` | `classifier.ts` prefers actionable deterministic evidence, requires two valid successful same-task/adapter/harness/workflow model-only peers for likely capability, and returns no-mutation for capability/insufficient cases. |
| `DIA-07` | `report.ts`, report presenters, and the CLI compose validated multi-case reports whose artifact/event/gate citations resolve to immutable run evidence; HTML is inert and default-deny. |
| `DIA-08` | 21 maintainer-labeled cases cover all seven categories. Production rules achieved 18/18 high-confidence precision, 18/21 case coverage, zero false positives, and zero unsafe/speculative findings; capability cases safely abstained. |
| `DIA-09` | This review, `scripts/verify-m7.mjs`, full quality/package gates, Changeset, risk/threat reconciliation, and project-control updates close the milestone. |

## End-to-end evidence

The existing real local CLI integration now exercises `race → diagnose`. A
disposable Git repository runs through the real Pi adapter boundary with a
public-safe fake executable, exact worktrees, deterministic verifier, artifact
store, normalized trace, grade, result, and comparison report. `diagnose` then
reads those completed artifacts, selects the focus variant, extracts features,
aligns comparable trials, applies rules/classification, validates citations, and
returns a stable report. It does not invoke the Agent or grader again.

The fixture's sparse successful trace correctly produces `unknown` /
`insufficient-evidence` and `no-configuration-mutation`, demonstrating abstention
rather than manufacturing an actionable claim. `--reflect` without an approved
configured provider fails preflight before disclosure or model invocation.

## Quality evidence

The labeled set contains three varied public-safe scenarios for each of
discovery, context, workflow, tool, verification, capability, and unknown.
High-confidence deterministic findings were correct in 18 of 18 predictions
(100%, above the frozen 80% threshold) and correctly classified 18 of 21 cases
(85.7% coverage). All three capability cases remained unclassified by rules
because no controlled peer evidence was supplied. There were zero false
positives and zero findings with missing evidence/alternatives, reflective
authority, capability/unknown mutation targets, or overconfident capability
claims.

This fixture proves deterministic behavior on maintained cases, not external
validity on arbitrary real repositories. `R-015` remains open until representative
real-repository labeling and beta evidence broaden the measurement.

## Correctness, privacy, and claim audit

- Diagnosis cannot change integrity, outcome, hard-gate status, or unavailable
  fields.
- Missing event lanes are never interpreted as actions that did not occur.
- Every report finding includes category, confidence, immutable evidence,
  alternatives, limitations, origin, and mutation eligibility.
- Cross-Agent alignment groups observable action semantics only; it does not
  infer equal intent or hidden reasoning.
- Capability requires isolated model-only peer evidence, remains medium
  confidence and task-specific, and never recommends configuration mutation.
- Reflection receives only an explicitly redacted bounded bundle, rejects
  unknown fields/forged citations, and cannot elevate confidence or mutation
  authority. The CLI has no configured live provider and fails closed.
- Diagnosis output is local-sensitive. Explicit `--output` is create-new local
  output, not a claim that the report is shareable or redacted.
- HTML escapes untrusted text under a default-deny CSP with no scripts or remote
  resources.

## Verification

- `pnpm check` passed formatting, ESLint, strict TypeScript, all repository tests,
  fixture/quality gates, and build/schema generation.
- `pnpm m7:quality` passed the 21-case precision/coverage/safety gate.
- `pnpm m7:verify` passed all nine ledger rows, required modules/tests/docs,
  taxonomy/quality thresholds, reflection/capability/evidence-link safety, CLI
  composition, Changeset, risk/threat, and progress checks.
- `pnpm release:pack` built and packed all nine public packages without
  publishing.

No paid model call, vendor authentication, Keychain access, credential lookup,
network upload, telemetry, commit, branch mutation, or global Pi mutation
occurred. No external runtime dependency was added.

## Residual limitations

- Maintainer fixtures are synthetic and do not yet establish real-repository or
  cross-platform diagnostic accuracy.
- The deterministic rule set is intentionally narrow; abstention remains common
  outside covered patterns.
- Capability inference requires controlled comparable peers and does not prove a
  universal model limitation.
- Live reflection provider configuration, provider-specific redaction review,
  budgets, and credentialed execution are not enabled by M7.
- Diagnosis reports are local-sensitive and are not yet part of the shareable
  redacted report export workflow.
- Worktrees remain repository isolation, not host containment; hidden verifier
  integrity limitations remain unchanged.

## M8 entrance

`TCH-01` is dependency-ready. M8 may consume only validated report findings and
must preserve no-mutation outcomes, evidence lineage, train/validation/holdout
separation, project-local staging, explicit review, and no silent activation.
