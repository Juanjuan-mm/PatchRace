# @patchrace/diagnosis

Evidence-linked comparison and diagnosis foundations.

`FAILURE_TAXONOMY` freezes the seven conservative Pi failure categories with
positive examples, exclusions, and a precedence that keeps capability inference
behind deterministic explanations and uses `unknown` for insufficient evidence.

`extractTrajectoryFeatures` reproducibly derives observable file coverage,
search loops, command failures, time/test order, edit footprint, retries, and
cross-trial deltas. Empty unknown lanes remain unavailable rather than becoming
fabricated zeroes.

`alignObservableTrajectories` groups semantically comparable observable actions
across adapters while retaining per-trial order and provenance. Vendor tool names
are not required to match, missing action surfaces remain explicit, and messages
or hidden reasoning are not alignment inputs.

`diagnoseWithRules` emits stable evidence-linked findings for direct tool errors,
verification gaps, discovery loops, unchanged failed retries, and explicit
constraint failures. Invalid or insufficient evidence returns `unknown`, and
every finding exposes alternatives, limitations, rule provenance, and bounded
mutation targets.

`reflectDiagnosis` is an opt-in provider boundary over an explicitly redacted,
bounded evidence bundle. It strictly validates output, refuses forged citations
or replacement facts, and returns only low-confidence, non-promotable
hypotheses alongside unchanged deterministic diagnosis.

`classifyWorkflowOrCapability` prefers actionable high-confidence deterministic
workflow/configuration evidence. Likely capability requires repeated valid
model-only peer successes; confounded or incomplete cases return insufficient
evidence. Both non-workflow outcomes explicitly recommend no configuration
mutation.

`buildDiagnosisReport` validates every finding and resolves every cited
artifact/event/gate against an immutable inventory before producing a stable
multi-case report. Dangling or cross-run evidence fails closed.

`evaluateDiagnosisQuality` measures high-confidence deterministic precision and
case coverage on unique maintainer labels, breaks results down by category, and
fails on unsafe or speculative authority. The checked fixture has 21 public-safe
cases spanning every taxonomy category.

`rankRace` implements the configurable `correctness-first-v1` policy. Valid
deterministic hard gates always precede stability, cost, latency, and footprint;
raw dimensions, unavailable values, ties, exclusions, and small-sample caveats
remain visible in the returned comparison.

`buildTrajectoryTimeline` aligns normalized observable file, search, command,
edit, test, and error events by semantic target while retaining event provenance,
marking unavailable vendor lanes, and bounding displayed evidence. It never
attempts to reconstruct hidden reasoning.

Baseline regression comparison requires matching task commitments and ranking
policy, reports every raw delta, and emits explicit `promote`, `hold`, or `reject`
decision inputs. It never activates a candidate.
