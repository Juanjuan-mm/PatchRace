# Launch Personas and Ranked Workflows

Accepted: 2026-07-22

## Personas

### P1 — Pi Workflow Builder (primary)

Profile:

- advanced individual developer or small-team technical lead;
- already uses Pi regularly and has project/global Skills, prompts, instructions, or packages;
- may also have authenticated Claude Code or Codex access;
- comfortable with Git, CLI tools, tests, and reviewing diffs;
- skeptical of generic benchmark claims and wants repository-specific evidence.

Primary need:

> Improve my Pi setup without turning `AGENTS.md` into an untested pile of rules.

Success:

- understands where Pi underperforms;
- receives the smallest appropriate Pi mutation;
- can verify, promote, and roll it back;
- spends within an explicit budget.

Main anxieties:

- wasting tokens and subscription quota;
- leaking private code or credentials;
- corrupting working trees or global Pi config;
- overfitting to one impressive demo;
- installing opaque third-party packages.

### P2 — Skill/Extension Author or OSS Maintainer

Profile:

- authors reusable Skills, prompts, Pi packages, or coding-agent guidance;
- needs evidence that a change helps multiple relevant tasks and does not regress cost/compatibility;
- wants reproducible reports for releases and contributors.

Primary need:

> Treat my Agent Skill like code: test it against a baseline, inspect variance, and publish evidence.

Success:

- creates a fixture-backed task suite;
- compares with/without Skill under controlled conditions;
- finds triggering, bloat, version, or workflow regressions;
- attaches a reproducible report to a release or pull request.

Main anxieties:

- LLM judge bias;
- tiny samples presented as universal proof;
- agent/version drift;
- contributors unable to reproduce results.

### P3 — Coding-Agent Evaluator for a Small Engineering Team

Profile:

- staff engineer, developer-productivity lead, or hands-on engineering manager;
- evaluates Pi, Claude Code, Codex, models, instructions, and reasoning/cost settings;
- operates a private repository but does not want a new hosted evaluation platform.

Primary need:

> Decide which agent configuration to use for which repository task, with evidence the team can audit.

Success:

- mines representative historical tasks;
- separates model, harness, and workflow comparisons;
- sees correctness, stability, cost, time, footprint, and failure evidence;
- adopts a defensible configuration or rejects a change.

Main anxieties:

- private source leaving approved vendors;
- misleading vendor/model comparisons;
- unbounded cost;
- maintenance burden from CLI drift;
- reports that executives can misread as universal rankings.

## Deliberate non-primary users

- Beginners without Git/test/CLI familiarity: the prepared example may work, but v0.1 does not optimize for no-code onboarding.
- Enterprise platform administrators: team RBAC, audit backends, remote workers, and policy management are deferred.
- Benchmark researchers needing massive distributed runs: PatchRace may export data later but is not a cluster benchmark framework in v0.1.
- Users seeking autonomous multi-agent collaboration: PatchRace agents compete independently; they do not coordinate to complete one task.

## Ranked end-to-end jobs

### W1 — Compare configurations on a real task

Rank: 1

Entry conditions:

- supported Git repository and task instruction;
- at least Pi plus one comparison variant, or two Pi configurations;
- valid setup and deterministic verifier;
- explicit run/time/cost budget.

Flow:

1. Inspect environment with `doctor`.
2. Freeze repository baseline and task config.
3. Create isolated worktrees.
4. Run variants and repeat count.
5. Grade correctness before secondary metrics.
6. Inspect terminal/HTML report and exact evidence.

Desired outcome:

- user knows which variants passed, how stable they were, what they cost, and what comparison axis was actually measured.

Failure modes:

- invalid/flaky task;
- dirty baseline captured incorrectly;
- adapter auth/version mismatch;
- budget exhaustion;
- unavailable cost metrics presented as zero;
- a winner selected despite correctness failure.

### W2 — Build a repository-specific replay suite

Rank: 2

Entry conditions:

- local Git history; optional GitHub metadata through user-controlled `gh` auth;
- merged changes or curated manual tasks;
- user willing to review mined tasks.

Flow:

1. Mine candidate commits/PRs.
2. Reset each to the parent baseline.
3. extract task intent and hold back tests/reference evidence;
4. reject generated/dependency-only/ambiguous/flaky tasks;
5. review and categorize accepted tasks;
6. freeze train/validation/holdout split and hashes.

Desired outcome:

- a versioned, leakage-resistant task suite representative of the user's real work.

Failure modes:

- solution/test leakage;
- parent does not build;
- PR mixes unrelated changes;
- hidden verifier only accepts the human implementation;
- insufficient tasks for an improvement claim;
- private GitHub data is uploaded unintentionally.

### W3 — Diagnose why Pi loses

Rank: 3

Entry conditions:

- completed Pi run plus comparison or baseline evidence;
- normalized observable traces and deterministic grades;
- enough evidence for at least one non-speculative finding.

Flow:

1. Extract deterministic features.
2. Align observable file/search/command/edit/test actions.
3. classify discovery, context, workflow, tool, verification, capability, or unknown gap;
4. cite exact evidence and alternative explanations;
5. recommend the smallest appropriate mutation target or no mutation.

Desired outcome:

- user understands a bounded, evidence-linked reason for failure and knows whether a Pi workflow change is appropriate.

Failure modes:

- hidden reasoning is fabricated;
- correlation is described as causation;
- missing vendor events are treated as absence of action;
- every failure is incorrectly turned into a Skill;
- low-confidence diagnosis is presented confidently.

### W4 — Teach Pi and prove/reject a candidate

Rank: 4

Entry conditions:

- accepted diagnosis and eligible task evidence;
- current Pi resource inventory;
- explicit mutation type, objective, and budget;
- protected validation and holdout split when task count permits.

Flow:

1. Route diagnosis to context, Skill, prompt, settings recommendation, model advice, or no change.
2. Stage an exact project-local candidate diff.
3. review provenance, token/complexity impact, and safety flags.
4. run one-variable ablation on screening/validation tasks.
5. reject weak candidates; final candidate uses holdout once.
6. promote explicitly or retain baseline; record rollback.

Desired outcome:

- a Pi change is promoted only with repository-specific evidence, or rejected with a clear reason.

Failure modes:

- holdout contamination;
- multiple simultaneous mutations obscure causality;
- global Pi config changes silently;
- executable candidate content activates before review;
- training improvement masks holdout regression;
- search cost exceeds budget.

### W5 — Guard against workflow regression

Rank: 5

Entry conditions:

- stored valid baseline and task suite;
- a proposed Pi/model/Skill/prompt/package/adapter version change;
- compatibility and budget policy.

Flow:

1. Identify the changed variable and baseline provenance.
2. run selected regression suite with repeat policy.
3. compare correctness, stability, cost, latency, footprint, and diagnosis changes.
4. emit promote/hold/reject evidence for local review or CI.
5. update baseline only through explicit approval.

Desired outcome:

- user can update or roll back agent configuration with the same discipline used for code changes.

Failure modes:

- baseline schema/version is incompatible;
- vendor CLI drift changes behavior silently;
- CI cannot authenticate safely;
- a composite score hides correctness regression;
- stale tasks no longer represent the repository.

## Workflow priority rationale

`W1` and `W2` create the evidence substrate. `W3` turns comparison into understanding. `W4` delivers the distinctive Pi improvement outcome. `W5` creates repeat usage and long-term value. The product should not optimize the teaching-loop demo by skipping trustworthy task construction or comparison evidence.

## Beta interview checks

For each persona, measure:

- which workflow caused installation;
- whether the user returned for `W4` or `W5`;
- which evidence they trusted or ignored;
- whether report language caused overgeneralization;
- acceptable time and cost budget;
- what data they refused to expose;
- whether the proposed Pi artifact was understandable and reviewable.
