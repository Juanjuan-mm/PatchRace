# v0.1 Success, Launch, and Stop Criteria

Accepted: 2026-07-22

These are product gates, not forecasts. Measurements must include environment, suite, adapter versions, task count, retries, exclusions, and known uncertainty.

## Evidence tiers

PatchRace must qualify claims by available task evidence:

| Eligible task count | Allowed product behavior |
|---:|---|
| 0–4 | Diagnosis and suggestions only. No “proven improvement” or automatic candidate selection. |
| 5–14 | Exploratory candidate comparison. Reports must say evidence is insufficient for generalization. |
| 15–29 | Train/validation split plus a reserved final holdout of at least 5 tasks; case-study claims allowed with caveats. |
| 30+ | Full train/validation/holdout workflow with category-aware splitting and repeated runs on selected tasks. |

No task may be counted if it is flaky, leaks the intended solution, cannot establish a valid baseline, or has a compromised grader.

## Activation gates

Measured on a supported clean environment:

| Metric | v0.1 gate |
|---|---:|
| Prepared example: install to first valid report, median | ≤ 5 minutes |
| Prepared example: install to first valid report, p90 | ≤ 10 minutes |
| Required manual configuration for prepared example | No API-key copy if a supported local CLI is already authenticated; no hosted PatchRace account |
| First local repository suite from `init` or reviewed mined tasks | ≤ 30 minutes for a documented small repository |
| Failed setup diagnostics | Must name the missing tool/version/auth/capability and a recovery action |

The timer excludes downloading the user's agent CLIs or a repository's unusually large dependencies, but documentation must disclose these exclusions.

## Reliability and recovery gates

| Metric | v0.1 gate |
|---|---:|
| Deterministic fixture pipeline success across supported CI matrix | ≥ 99% over the final 100 executions, excluding confirmed CI-provider outages |
| Started runs that end with a readable terminal artifact or explicit recoverable state | ≥ 98% in dogfood |
| Orphaned PatchRace-created worktrees/processes after tested interruption scenarios | 0 across at least 50 interruption/cleanup trials |
| Existing branch/worktree/unrelated-file damage | 0 tolerated |
| Resume idempotency on supported checkpoints | No duplicated completed trial or conflicting artifact in the reference suite |
| Unsupported adapter version behavior | Clear refusal or declared degraded mode; never silent malformed comparison |

Any confirmed user-data-loss or unrelated-worktree deletion bug blocks release regardless of aggregate reliability.

## Dogfood gate

Before `BETA-02`:

- At least 50 successful end-to-end runs.
- At least 10 distinct tasks.
- All three launch adapters exercised.
- At least 10 cancellation, crash, resume, or cleanup scenarios.
- At least 5 candidate-generation/validation cycles.
- At least 3 rejected candidates, proving rejection paths work.
- Runs cover TypeScript and Python fixtures plus one additional realistic ecosystem by launch.
- Every failure is classified as product bug, environment/adapter issue, invalid task, agent failure, or expected budget stop.

## Beta gate

At least five target users who did not author the implementation attempt the product:

| Metric | Gate |
|---|---:|
| Produce a valid prepared-example report without live maintainer intervention | ≥ 4/5 |
| Produce a valid report on their own or a realistic non-fixture repository | ≥ 3/5 |
| Correctly explain what passed/failed from the report | ≥ 4/5 |
| Review a diagnosis/candidate and understand why it was proposed | ≥ 3/5 |
| Return for a second meaningful run or state a concrete repeat-use intent | ≥ 3/5 |
| Critical usability blockers left open | 0 |

Stars, impressions, and one-time installs are launch indicators, not beta success criteria.

For the source-only `v0.1.0-rc.1` GitHub preview, `ADR-022` explicitly waives
this pre-publication gate. The waiver is not evidence that the gate passed:
the release must state that independent-user activation, understanding, and
repeat-use are unvalidated, and it must not make stable-release or
beta-validated claims. Owner testing and post-publication feedback may discover
issues, but neither substitutes for the five-user evidence required before a
stable/npm release.

## Comparison and diagnosis gates

- Reports always distinguish model comparison, harness comparison, and workflow/configuration ablation.
- Hard correctness gates appear before cost, speed, footprint, or LLM review.
- Raw per-dimension evidence remains available; a composite score cannot be the only explanation.
- At least 20 labeled diagnosis cases cover all top-level taxonomy categories before release.
- High-confidence rule-based diagnosis precision must be at least 80% on that labeled set; unclassified cases are preferable to confident fabrication.
- Every diagnosis cites concrete run events, commands, files, patches, or grader evidence.
- The system can return “insufficient evidence” and “likely model capability gap.”

## Teaching-loop proof gate

At least one public-safe, reproducible case study must complete:

```text
frozen tasks → baseline → diagnosis → one focused mutation
→ validation → final holdout → promote or reject
```

For a promoted launch case:

- At least 15 eligible tasks total and at least 5 untouched final holdout tasks.
- The candidate changes one declared Pi mutation set.
- No deterministic correctness, protected-path, safety, or cleanup regression.
- It achieves either:
  - at least +10 percentage points on the predeclared validation success metric with no holdout regression; or
  - equal correctness with at least 20% lower median cost or wall time on validation and no holdout regression.
- The final holdout is run only after candidate selection and is not reused for another tuning cycle.
- The case is labeled a repository-specific result, not universal evidence.

If no candidate meets this gate, the honest launch artifact may show a rejection, but the automatic teaching loop cannot be the primary v0.1 claim.

## Performance and cost gates

Measured separately from agent inference and repository dependency installation:

| Metric | v0.1 gate |
|---|---:|
| PatchRace orchestration overhead on fixture races | ≤ 5% of total non-inference run time or ≤ 2 seconds per trial, whichever is more practical and documented |
| Static report generation for a 50 MB normalized run set | ≤ 10 seconds on the reference developer machine |
| Peak PatchRace process memory for that report | ≤ 750 MB |
| Default teaching-cycle hard budget | Must be configured before execution; suggested initial cap $25 equivalent and 30 trials |
| Budget overrun | 0 silent overruns; in-flight vendor accounting uncertainty must be shown |

Cost numbers from different vendors may not be directly comparable. Unknown or subscription-bundled cost must be labeled unknown rather than estimated as zero.

## Security and privacy gates

- Zero known critical or high-severity unresolved vulnerabilities at release.
- Zero known cases of deletion outside a validated PatchRace run root.
- Zero automatic writes to global Pi configuration.
- Zero automatic report/trace upload or product telemetry.
- All seeded credential fixtures are redacted in export tests; limitations and user review remain mandatory.
- Malicious path, symlink, command, HTML/report injection, grader tampering, and generated-artifact fixtures pass the agreed threat tests.
- Package contents and dependencies pass license/provenance review.
- Security and private-reporting contact is real before public launch.

## Documentation and compatibility gates

- Clean quickstart succeeds on supported macOS and Linux targets.
- Exact supported Node, Git, Pi, Claude Code, and Codex version ranges are published.
- Installation, methodology, security/privacy, cleanup, troubleshooting, contribution, and adapter/grader documentation exist.
- At least three realistic example ecosystems are published, with at least one full teaching-loop example.

## Launch decision

`QA-09` may pass only when every P0 gate above has evidence. A missed gate results in one of:

1. fix and retest;
2. reduce the public v0.1 claim/scope through an accepted ADR;
3. delay launch.

It must never be converted into a vague “known issue” when it concerns data loss, secret publication, invalid grading, holdout leakage, or silent candidate activation.

`ADR-022` applies option 2 only to the independent-user beta gate and only to
the source-only `v0.1.0-rc.1` GitHub preview. It does not waive any
correctness, data-loss, privacy, security, grading, holdout, candidate
activation, documentation, or package-content gate.

## Stop and pivot criteria

These prevent continuing a compelling story without user value:

### Onboarding pivot

If fewer than 3 of 5 beta users can produce a valid prepared-example report without live intervention after one focused remediation cycle, pause feature work and redesign installation/onboarding before launch.

### Teaching-loop pivot

If, after all of the following, no candidate shows validation benefit without holdout/safety regression:

- at least 3 materially different repositories;
- at least 15 eligible tasks per repository;
- at least 150 total candidate-evaluation trials;
- at least two mutation types such as Skill and context-file changes;

then remove automatic teaching as the primary v0.1 promise. Ship comparison plus diagnosis/candidate suggestions, or stop and reassess the product thesis.

### Cost pivot

If the median useful teaching cycle exceeds the predeclared $25-equivalent default budget for individual users after caching and successive halving, redesign the search strategy or make user-provided/offline evidence the default. Do not hide cost behind subscription accounting.

### Adapter pivot

If two of the three launch adapters cannot meet the compatibility contract across their supported versions without brittle undocumented behavior, narrow the supported matrix and add trace import rather than pretending feature parity.

### Safety stop

Any reproduced defect that can delete unrelated user data, expose authentication material through default behavior, or silently activate executable generated artifacts stops public release until fixed and independently reverified.
