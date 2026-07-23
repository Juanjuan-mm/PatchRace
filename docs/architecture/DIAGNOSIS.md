# Explainable Diagnosis Contract

Status: accepted incrementally by `DIA-01..DIA-09`  
Last updated: 2026-07-23

## Boundary

Diagnosis consumes durable normalized observable trace events, immutable artifact
references, and deterministic grader results. It never requests or reconstructs
hidden reasoning. Missing or unsupported events are unavailable evidence, not
proof that an action did not occur. Deterministic facts, task outcomes, integrity
states, and hard gates cannot be changed by a rule or optional reflection.

## Failure taxonomy

The stable top-level categories are:

| Category | Definition | Typical positive evidence |
|---|---|---|
| `discovery` | Relevant repository evidence was not located or inspected early enough to act on it. | Exposed broad search loops, delayed first relevant read. |
| `context` | Supplied or read task/repository facts were omitted, contradicted, or applied incorrectly. | Instruction constraint contradicted by patch or command. |
| `workflow` | Observable actions used an ineffective sequence, scope, or retry pattern despite usable evidence and tools. | Unchanged retries, edit/test ordering, avoidable broad-first loop. |
| `tool` | A required tool, command surface, or adapter capability was operationally unavailable, failed, or incompatible. | Spawn/parser/tool failure or explicit capability-unavailable event. |
| `verification` | Relevant deterministic validation was omitted, delayed, mis-scoped, or not acted upon. | Final edit after last relevant test, required gate not run. |
| `capability` | Valid comparable evidence suggests the selected model could not solve the task after narrower deterministic causes were excluded. | Repeated same-harness peer success and focused-trial failure with adequate observable workflow. |
| `unknown` | Evidence is insufficient, invalid, incomplete, conflicting, or confounded. | Partial trace, invalid integrity, mixed model/harness/workflow changes. |

The executable source of truth is `FAILURE_TAXONOMY` in
`@patchrace/diagnosis`. It includes positive examples and category-specific
non-overlap guidance.

## Classification precedence

Rules consider direct operational and deterministic explanations before broader
inferences: `tool → verification → discovery → context → workflow → capability
→ unknown`. This is a conservative tie-breaking order, not a claim that a trial
can have only one finding. Multiple findings may coexist when they cite distinct
evidence.

`capability` requires comparable, valid, non-confounded evidence and the absence
of a supported narrower cause. `unknown` is the required result when event
availability, grader integrity, or comparison identity is insufficient.

## Non-overlap rules

- A successful but inefficient tool use is `workflow`; an operational failure or
  explicit missing capability is `tool`.
- Locating a fact too late is `discovery`; observably receiving it and applying it
  incorrectly is `context`.
- Ineffective action ordering is `workflow`; missing or stale final validation is
  `verification`.
- A failed verifier caused by the patch is Agent evidence; verifier
  infrastructure error or non-valid integrity cannot support Agent blame.
- Missing vendor lanes never establish skipped actions.
- Capability is not a fallback synonym for failure. Confounded or sparse evidence
  is `unknown`, and both categories default to no automatic configuration
  mutation.

## Evidence and confidence

Every eventual finding must cite immutable run/trial identity, artifact hash,
logical artifact path, and the relevant event IDs or grader gate IDs. Confidence
describes support for the claim, not task importance:

- `high`: direct deterministic, valid, non-confounded evidence;
- `medium`: multiple consistent observations with stated limitations;
- `low`: a bounded hypothesis or optional reflection, never independently
  promotable.

Later M7 tasks add the feature, alignment, rule, reflection, report, and labeled
quality contracts without weakening this taxonomy.

## Deterministic trajectory features

`extractTrajectoryFeatures` accepts one strictly ordered normalized trace, its
immutable artifact citation, declared task-relevant paths, trace completeness,
and explicit per-lane availability. It deterministically computes:

- observed coverage of declared relevant files;
- repeated equal search signatures;
- failed command events;
- monotonic time to the first exposed test;
- ordered completed/failed test events;
- edited paths and available changed-line totals;
- repeated equal command signatures.

Counts are zero only when the caller declares that lane observed. With no event
and no completeness declaration, the feature is `unavailable`, never zero.
Redacted/unavailable events are not treated as observed actions. Every feature
retains its input event IDs, and partial/unknown traces produce limitations.

`diffTrajectoryFeatures` uses an explicit `right-minus-left` convention for
coverage, loop, failure, timing, test, edit, and retry deltas. If either input is
unavailable, the delta remains unavailable.

## Cross-Agent alignment

`alignObservableTrajectories` aligns only completed/failed normalized actions:
file inspection/listing, search, test, other command, edit, and observed error.
The semantic key ignores vendor tool names and normalizes repository paths.
Recognized test commands and normalized test events share a `run-test` action, so
different adapter surfaces can be compared without pretending their raw events
are identical.

Every occurrence retains variant/trial, event ID, sequence, per-variant ordinal,
availability, event type, and raw reference. Groups state whether evidence spans
variants or appears in only one. An action with no events is marked unavailable
unless the caller explicitly declares that action surface observed. Observable
message text is not an alignment action and no intent or hidden reasoning is
derived from semantic proximity.

## Deterministic rules

`diagnoseWithRules` freezes the trial integrity, outcome, and hard-gate statuses
as immutable facts before evaluating rules. If integrity is not `valid`, outcome
is unavailable, or a required gate is error/unavailable, narrower Agent-blaming
rules are suppressed and the result is `unknown`.

Current high-confidence rules cover:

- explicit normalized tool/adapter/parser/spawn errors;
- absent observed verification or a final edit after the last test when a
  deterministic test-related gate fails;
- repeated search with incomplete declared relevant-file coverage on a complete
  trace;
- equal command retries while failed command evidence exists;
- explicitly named instruction/repository-constraint gate failure.

Findings have stable content-derived IDs, exact trace event and/or grader gate
citations, alternatives, limitations, eligible mutation targets, rule IDs, and
`deterministic-rule` origin. When no rule matches, the engine emits a
low-confidence `unknown` finding with no eligible mutation target.

## Optional reflection

Reflection is an explicit provider call, not part of deterministic diagnosis.
`reflectDiagnosis` accepts only a non-empty `redaction: redacted` evidence bundle
with unique allowlisted IDs, frozen deterministic facts/finding summaries, a
hard hypothesis count, and an abort signal. Provider/model/version and canonical
input hash are recorded.

Provider output uses a strict object schema. Unknown fields—including attempted
replacement facts—are errors. Each hypothesis must use a frozen taxonomy
category and cite only evidence IDs supplied in the redacted bundle. Output
hypotheses are always `low` confidence, have no eligible mutation targets, and
carry `reflection` origin plus a deterministic-corroboration limitation.
Deterministic facts and findings remain separately embedded and unchanged.

## Workflow versus capability

`classifyWorkflowOrCapability` has three conservative outcomes:

- `workflow-or-configuration-gap` requires a high-confidence deterministic
  discovery/context/workflow/tool/verification finding with an eligible safe
  project-local mutation target;
- `likely-model-capability-gap` requires a valid failed focus trial, no narrower
  actionable deterministic finding, a complete-enough diagnosis, and at least
  two valid successful peer trials that match task, adapter, harness, and
  workflow while changing the model;
- `insufficient-evidence` covers sparse, invalid, incomplete, or confounded
  comparisons.

Capability is medium-confidence and task/variant-specific, never proof of a
general model limitation. Both capability and insufficient-evidence outcomes
recommend `no-configuration-mutation` with an empty mutation target list.
Reflection may add a visible limitation but cannot elevate the classification.

## Evidence-linked report

The stable diagnosis report contains source run/plan identity, an immutable
artifact inventory, one or more focus-variant cases, frozen facts, features,
optional cross-Agent alignment, deterministic and reflected findings, gap
classification, reflection provenance, and caveats.

Every artifact inventory entry allowlists its exact hash, trial, logical path,
event IDs, and grader gate IDs. Report construction fails closed on cross-run,
dangling artifact, event, or gate citations. Every finding requires evidence and
an alternative explanation; reflection remains low-confidence/non-promotable;
and a no-mutation classification cannot expose mutation targets.

Canonical JSON is the stable machine view. The standalone HTML view escapes all
untrusted content, has a default-deny CSP, executes no scripts, and makes the
observable-evidence/claim boundary prominent.

## Labeled quality gate

`evaluateDiagnosisQuality` measures high-confidence deterministic rule findings
against unique maintainer labels. It reports finding-level precision, case-level
coverage, per-category support/correct cases, exact false positives,
unclassified cases, and unsafe/speculative findings.

The frozen M7 gate requires at least 20 cases, labels covering all seven
categories, at least 80% high-confidence precision, and zero unsafe/speculative
findings. Unclassified cases do not reduce precision but remain visible in
coverage. The safety audit flags missing evidence/alternatives, reflection
confidence or mutation authority, mutation targets on capability/unknown, and
overconfident capability findings.
