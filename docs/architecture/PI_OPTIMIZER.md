# Pi Candidate and Optimizer Contract

Status: current v0.1 contract
Last updated: 2026-07-22

## Purpose and limits

The optimizer turns evidence-linked Pi workflow diagnoses into small, reviewable, project-local candidates. It is allowed to return `no_candidate` when evidence is insufficient or indicates model capability. It cannot change deterministic facts, access final holdout data during proposal/selection, generate executable Extensions, silently activate resources, or write global Pi configuration.

## Diagnosis input

```ts
interface DiagnosisV1 {
  id: string;
  category: "discovery" | "context" | "workflow" | "tool" | "verification" | "capability" | "unknown";
  confidence: "high" | "medium" | "low";
  claim: string;
  evidence: EvidenceCitation[];
  alternatives: Array<{claim: string; evidence?: EvidenceCitation[]}>;
  eligibleMutationTargets: MutationType[];
  limitations: string[];
}

interface EvidenceCitation {
  runId: string;
  trialId: string;
  artifactHash: string;
  logicalPath: string;
  eventIds?: string[];
  gradeGateIds?: string[];
  excerptHash?: string;
}
```

Every actionable claim cites immutable observable trace, patch, command, or grader evidence. Low-confidence reflection may propose a hypothesis but cannot produce a promotable candidate without deterministic corroboration. Capability/unknown diagnoses default to no mutation.

## Allowed mutation types

| Type | Project-local target | Constraints |
|---|---|---|
| `agents-guidance` | `AGENTS.md` or a narrower nested `AGENTS.md` | concise, repository-specific, no secrets, no hidden test facts |
| `skill` | declared Pi Skill directory/`SKILL.md` | valid frontmatter, bounded references, no generated executable scripts in v0.1 |
| `prompt-template` | Pi prompt template Markdown | explicit invocation and task scope |
| `settings` | candidate settings fragment | allowlisted non-auth, non-package, non-extension keys only |
| `resource-selection` | PatchRace variant declaration | enable/disable existing reviewed project-local resources |

Package installation, global settings, credentials, hooks, arbitrary scripts, and TypeScript Extensions are forbidden mutation targets. Recommendations may mention them as manual future work but cannot stage or promote them.

## Candidate artifact

```yaml
schemaVersion: 1.0.0
candidateId: cand_01J...
parentCandidateId: null
baselineId: pi-main
createdAt: 2026-07-22T00:00:00Z
generator:
  kind: builtin-bounded-v1
  version: 1.0.0
inputs:
  diagnoses: [diag_01J...]
  evidenceHashes: [sha256:...]
  visibleSplitHash: sha256:...
mutation:
  type: agents-guidance
  target: AGENTS.md
  beforeHash: sha256:...
  patchHash: sha256:...
  declaredVariable: require-focused-test-before-full-suite
objectives:
  policy: correctness-first-v1
  constraints:
    maxAddedLines: 20
    maxContextTokens: 250
evaluation:
  trainRuns: []
  validationRuns: []
  holdoutRun: null
decision:
  state: staged
  reason: awaiting-ablation
```

Candidate directory contains exact before/after files, unified diff, lint results, evidence/diagnosis references, complexity estimate, conflict scan, run lineage, and promotion/rollback plan. All fields and content are hashed under the run-artifact rules.

## Proposal rules

1. Select only failures where baseline validity and grader integrity are valid.
2. Prefer the narrowest mutation target supported by cited evidence.
3. Change one declared variable per candidate; coupled files are allowed only when inseparable and are one mutation set.
4. Avoid restating generic coding advice or facts already provided by a narrower active resource.
5. Scan for contradictions, path overbreadth, secret-like text, hidden-verifier leakage, executable instructions, and context bloat.
6. Enforce evidence-tier behavior: 0–4 tasks allow suggestions only and no
   proven-improvement claim.
7. Stop when evidence indicates capability, irreducible flake, invalid task, or an objective tradeoff needing user choice.

## Ablation design

An ablation compares the exact accepted baseline against exactly one candidate mutation set on the same task snapshots, adapter/model version, model selection, budgets, repetition policy, environment-name set, and scheduler policy. Ordering should be randomized or balanced when repeated runs are used; order and cache state are recorded.

Train data may generate candidates. Validation data ranks/selects them. The final holdout is not visible to the proposer and is opened only after a candidate and decision thresholds are frozen. A failed holdout cannot feed another candidate without retiring that holdout and creating a new independently reserved set.

## Objective vector

Evaluation preserves raw dimensions:

```text
hard gates: grader integrity, task correctness, safety, protected paths
then: success rate/stability ↑, cost ↓, latency ↓, edit footprint ↓,
      context tokens ↓, candidate complexity ↓
```

`ObjectiveVectorV1` stores availability, value/unit, sample count, task IDs, repeats, variance/interval where valid, and source artifact hashes for each dimension. Unknown vendor cost/tokens stay unavailable. Correctness or safety regression cannot be compensated by speed/cost. Default selection is Pareto-aware and uses declared thresholds rather than an opaque scalar.

Default v0.1 decision rules:

- `promote_eligible`: no hard-gate regression; validation has at least the evidence tier required for claims; primary success objective improves by the predeclared threshold; cost/latency/footprint/complexity stay within budgets; final holdout passes when the tier requires it;
- `hold`: evidence is inconclusive, dimensions trade off without a policy winner, or required metrics are unavailable;
- `reject`: any correctness/safety/integrity regression, no improvement, budget/complexity breach, conflict/leakage, or holdout regression;
- `no_candidate`: diagnosis is capability/unknown or no safe mutation is supported.

Exact statistical thresholds are suite policy and must be frozen before trials; they cannot be changed after seeing results.

## Lineage and search budget

Every candidate points to its baseline/parent, diagnoses, generator/prompt hashes, visible split hash, mutations, all attempted evaluations, and terminal decision. Rejected candidates are retained to prevent repeated rediscovery and to prove rejection works.

Search uses a hard candidate/trial/time/token/cost budget. Baseline evidence may be reused only when task/variant/environment identities match. Successive halving may stop clearly inferior candidates, but early-stopped candidates cannot be described as fully evaluated. No unbounded retries.

## Promotion decision

```json
{
  "schemaVersion":"1.0.0",
  "candidateId":"cand_01J...",
  "decision":"promote|hold|reject|no_candidate",
  "policy":"correctness-first-v1",
  "hardGates":[],
  "objectiveVectorRef":"objectives.json",
  "trainSplitHash":"sha256:...",
  "validationSplitHash":"sha256:...",
  "holdoutSplitHash":null,
  "evidenceTier":"exploratory",
  "claimAllowed":"insufficient evidence for generalization",
  "reasons":[],
  "limitations":[],
  "decidedAt":"2026-07-22T00:00:00Z"
}
```

The optimizer recommends; `patchrace promote --confirm` applies. Promotion revalidates hashes, shows exact diff and destination, writes atomically to project-local paths, and records pre/post hashes. It never commits or pushes. Rollback succeeds only when the current promoted files still match the recorded postimage; divergence produces a conflict artifact rather than overwrite.

## Optimizer interface

```ts
interface Optimizer {
  propose(input: Readonly<ProposalInput>, signal: AbortSignal): AsyncIterable<CandidateProposal>;
  evaluate(candidate: CandidateSnapshot, plan: FrozenAblationPlan, signal: AbortSignal): Promise<ObjectiveVectorV1>;
  decide(candidate: CandidateSnapshot, policy: FrozenDecisionPolicy): PromotionDecisionV1;
}
```

`ProposalInput` exposes only allowed split data and redacted/capped evidence. Providers declare supported mutation types, deterministic/nondeterministic behavior, model/version if any, and resource/cost limits. Optional external optimizers consume/emit the same contracts and get no additional holdout or filesystem authority.

## Acceptance mapping

Diagnoses, immutable evidence citations, bounded mutation types, one-variable ablations, correctness-first objective vectors, complete lineage, split/holdout separation, terminal decisions, promotion safety, and rollback are specified.
