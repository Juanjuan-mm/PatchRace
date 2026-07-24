# Concepts and Methodology

Last updated: 2026-07-23

PatchRace compares coding-Agent runs and, when evidence supports it, proposes a
small project-local Pi workflow change. Its unit of evidence is not an Agent
brand or a polished final answer. It is a reproducible task at an exact commit,
a frozen variant, an explicit attempt, observable execution evidence, and a
deterministic grade.

This guide explains how to read that evidence and what conclusions it can
support. The normative details remain in the
[system architecture](architecture/SYSTEM_ARCHITECTURE.md),
[task and grader contract](architecture/TASK_AND_GRADER.md),
[trace schema](architecture/TRACE_SCHEMA.md),
[diagnosis contract](architecture/DIAGNOSIS.md), and
[optimizer contract](architecture/PI_OPTIMIZER.md).

## Core vocabulary

- A **task** freezes the repository commit, instruction, setup, verifier,
  assertions, budgets, provenance, and their content hashes.
- A **variant** is one exact configuration. Model, Agent harness/adapter, and Pi
  workflow/resources are independent dimensions.
- An **attempt** is one paid or local execution of a task/variant. Retries are
  new attempts with lineage, never silent replacements.
- A **trial** is the durable execution and grading record for an attempt.
- A **suite** is a reviewed set of eligible tasks with a committed split policy.
- A **hard gate** is deterministic correctness, integrity, safety, protected
  path, or budget evidence that cannot be overridden by a soft score or judge.
- A **diagnosis** is an evidence-linked explanation of an observed difference.
- A **candidate** is one bounded, reviewable, project-local Pi mutation set.

Unavailable information stays unavailable. Missing token counts are not zero,
missing events do not prove an action was skipped, and an infrastructure error
is not an Agent failure.

## What is being compared

Every report must name which axes changed:

| Comparison | Frozen dimensions | Changed dimension | Supported interpretation |
|---|---|---|---|
| Model | task, harness/adapter, workflow, budgets, environment policy | model/version | task-specific model difference under the frozen harness and workflow |
| Harness | task, model, workflow, budgets, environment policy | Agent CLI/adapter/harness | harness difference; not pure model quality |
| Workflow ablation | task, model, harness/adapter, budgets, environment policy | one declared Pi resource or workflow mutation set | effect of that workflow change on the evaluated tasks |

A trial that changes multiple dimensions can still be inspected, but it is
confounded and cannot isolate a causal winner. Environment identity, task and
baseline hashes, executable/adapter versions, prompt/wrapper hashes, budgets,
and attempt lineage are retained so comparability can be audited.

“Pi beat Claude” is therefore too broad. A defensible statement looks like:
“On these exact task revisions, with this model, harness, workflow, budget, and
environment policy, variant A passed 8 of 10 valid trials and variant B passed
6 of 10.” Generalization needs broader representative evidence.

## Correctness comes first

PatchRace evaluates in this order:

1. validate task, baseline, verifier, split authorization, and evidence
   integrity;
2. run required deterministic correctness, safety, and protected-path gates;
3. exclude invalid, compromised, unknown-integrity, or not-graded trials from
   the correctness denominator while keeping them visible;
4. compare success and stability;
5. compare available secondary dimensions such as cost, latency, edit
   footprint, context, and candidate complexity;
6. apply a predeclared decision policy.

Only `integrity: valid` with every required hard gate passed produces a passed
trial. A faster or cheaper failure cannot outrank a correct result. An optional
LLM judge or reflection cannot rescue failed tests, rewrite an outcome, or alter
deterministic facts. PatchRace preserves raw dimensions and uses Pareto-aware
selection rather than hiding tradeoffs in one opaque score.

Setup failure, grader infrastructure error, Agent failure, interruption, and
budget exhaustion are distinct outcomes. Treating all of them as “the Agent
failed” would corrupt the comparison.

## Repeated runs and uncertainty

Statistics are computed per exact task and variant identity. Only valid
`passed` and `failed` trials enter the correctness denominator. Reports retain
the eligible and excluded counts, success rate, Bernoulli sample variance,
standard error, 95% Wilson interval, failure categories, and source hashes.

PatchRace reports two different derived quantities:

- `pass@k` is a finite-sample, without-replacement estimate of seeing at least
  one success among `k` draws from the observed trials.
- `pass^k` is the plug-in scenario `successRate ** k` for all-success
  reliability, and is meaningful only under the stated independence
  assumption.

Neither is a confidence guarantee. Samples below 30, correlated retries,
excluded attempts, task reuse, and task-selection bias require visible caveats.
One attempt per variant is illustrative evidence, not a reliability estimate.
When retries are needed, their reason and ancestry remain visible.

Evidence tiers bound product claims:

| Eligible tasks | Allowed conclusion |
|---:|---|
| 0–4 | diagnosis and suggestions only; no proven-improvement claim |
| 5–14 | exploratory candidate comparison; insufficient for generalization |
| 15–29 | train/validation plus at least five reserved holdout tasks; case-study claim with caveats |
| 30+ | category-aware train/validation/holdout workflow with repeated selected runs |

Flaky tasks, leaked solutions, invalid baselines, and compromised graders are
not eligible merely to increase the count.

## Observable trace boundary

PatchRace records only user-observable surfaces exposed by the Agent CLI/SDK,
subprocess wrapper, filesystem diff, or grader: messages shown to the user,
tool calls, file operations, commands/tests, timing, usage when reported, and
results. It does not request, reconstruct, or infer hidden chain-of-thought.

Vendor reasoning summaries explicitly emitted to the user may be retained as
opaque observable messages, but they are not privileged truth. Paths or actions
mentioned only in prose are not treated as actual file reads or tool calls.
Redacted, malformed, partial, unsupported, or unavailable event lanes remain
labeled as such. A valid trace may be partial; partial evidence narrows the
claim instead of silently becoming complete.

Raw streams and full local reports are local-sensitive. A shareable export is a
separate, bounded projection with explicit limitations; redaction is risk
reduction, not a proof that every unknown secret or personal datum was removed.

## Failure taxonomy

Diagnosis uses seven stable top-level categories:

| Category | Meaning |
|---|---|
| `discovery` | relevant repository evidence was not located or inspected early enough |
| `context` | supplied or observed facts were omitted, contradicted, or applied incorrectly |
| `workflow` | the observable sequence, scope, or retry pattern was ineffective |
| `tool` | a required tool, command surface, adapter, or capability failed or was unavailable |
| `verification` | deterministic validation was missing, stale, mis-scoped, or ignored |
| `capability` | comparable evidence suggests a model limitation after narrower causes are excluded |
| `unknown` | evidence is sparse, invalid, incomplete, conflicting, or confounded |

Rules prefer direct operational explanations before broader inference:
`tool → verification → discovery → context → workflow → capability → unknown`.
Multiple findings may coexist when they cite different evidence. `capability`
is not a default label for failure; it requires valid comparable peer evidence.
When the basis is weak, `unknown` is the correct result.

Every actionable deterministic finding cites immutable artifact hashes and
specific trace event or grader gate IDs, includes an alternative explanation,
and records limitations. Confidence means strength of support, not severity.
Optional reflection consumes only a redacted, allowlisted evidence bundle and
can add low-confidence hypotheses; it cannot create mutation authority.

## From diagnosis to a Pi candidate

The teaching lifecycle is:

```text
frozen eligible tasks
  → baseline comparison
  → evidence-linked diagnosis
  → one bounded project-local candidate
  → explicit review
  → one-variable validation ablation
  → one-time final holdout
  → promote, hold, reject, or no candidate
```

Stable constraints may route to project guidance, procedures to a declarative
Skill, and an evidenced user-invoked workflow to a prompt. Settings/model/tool
advice is manual-only. Generated executable Extensions, scripts, hooks, package
installation, credentials, and global Pi mutations are forbidden in v0.1.
Capability or unknown diagnoses normally produce `no_candidate`.

Candidate generation and staging do not activate anything. Review approval
authorizes validation only. The evaluator freezes model, harness, task, budget,
environment, scheduler, and one declared workflow mutation so that the
candidate is an ablation rather than a bundle of changes. Search and retries
have hard budgets; early-stopped candidates are labeled not fully evaluated.

The objective vector keeps correctness, stability, cost, latency, footprint,
context, and configuration complexity separate with units, availability,
sample support, and provenance. The policy can return:

- `promote_eligible` when all hard gates pass and the predeclared improvement
  threshold and required holdout gate pass;
- `hold` when evidence or tradeoffs are inconclusive;
- `reject` on any correctness/safety/integrity regression, no improvement,
  budget breach, leakage/conflict, or holdout regression;
- `no_candidate` when evidence supports no safe mutation.

The CLI still requires a separate previewed and confirmed promotion. Promotion
writes only reviewed project-local resources and never commits or pushes.
Rollback requires the recorded postimage and refuses to overwrite divergence.

## Train, validation, and final holdout

Training evidence may generate candidates. Validation evidence selects among
frozen candidates. Final holdout tasks and reference patches are unavailable to
proposal, diagnosis-driven tuning, and selection; proposal views contain only
the holdout count and commitment.

After a candidate and decision policy are frozen, the final holdout may be
opened once for that gate. Its result cannot feed another mutation. If a failed
holdout inspires retuning, that holdout is retired and a new independently
reserved split is required. This prevents repeatedly “learning” the final test.

A promoted case with 15–29 eligible tasks needs at least five untouched holdout
tasks. The default success threshold is at least +10 percentage points on the
predeclared validation success metric with no holdout regression, or equal
correctness with at least 20% lower median cost or wall time and no holdout
regression. Thresholds are frozen before results are observed.

## How to state results

A result statement should include:

- exact task count/revisions, suite/split, repeats, exclusions, and failures;
- exact changed and frozen comparison dimensions;
- Agent/model/adapter versions, relevant budgets, and environment limitations;
- hard-gate outcomes before secondary metrics;
- uncertainty intervals and dependence/small-sample caveats;
- whether evidence is fixture, captured, synthetic, or live;
- whether the conclusion is task-specific, repository-specific, or broader.

Supported claims include:

- “This deterministic fixture proves the orchestration and holdout protocol.”
- “This repository-specific candidate passed its frozen validation and holdout
  policy.”
- “The trace supports a verification gap, with these cited events.”
- “Evidence is insufficient to distinguish workflow from capability.”

Unsupported claims include:

- universal Agent superiority from one suite or one run;
- model quality conclusions when harness and workflow also changed;
- a proven improvement from public deterministic fixtures alone;
- treating absent telemetry, cost, tokens, or trace lanes as zero;
- treating worktrees as a security sandbox;
- claiming redaction guarantees safe publication;
- reusing a final holdout for iterative tuning.

PatchRace can truthfully return `unknown`, `hold`, `reject`, or `no_candidate`.
Those are evidence-preserving outcomes, not product failures.
