# Public Positioning and Competitor Boundary

Accepted: 2026-07-22

## Category

PatchRace is an **open-source, local-first Pi workflow evaluation and improvement system**.

It is not positioned as:

- a new coding agent;
- a universal model leaderboard;
- a multi-agent task orchestrator;
- a prompt optimizer without repository evidence;
- a security sandbox;
- a replacement for Pi, Claude Code, or Codex.

## Public promise

> Race coding-agent configurations on real repository tasks, diagnose why Pi loses, distill reviewable Pi workflow candidates, and prove or reject each change on held-out tasks.

The central outcome is a defensible Pi configuration decision, not merely a winner label.

## Adjacent products and boundaries

| Project/category | What it demonstrably does | Overlap | PatchRace boundary |
|---|---|---|---|
| [EvoSkill](https://github.com/sentient-agi/EvoSkill) | Evolves skills and prompts against benchmarks, supports several coding-agent harnesses, evaluates variants, and keeps strong programs. | Automated skill/prompt improvement and held-out evaluation. | Do not claim to invent self-improving skills. Focus on Pi's complete project-local resource graph, historical repository task mining, teacher-trajectory deltas, explainable promotion/rollback, and a TypeScript/Pi-native UX. |
| [GEPA](https://github.com/gepa-ai/gepa) | General reflective text optimization using full traces, mutation, evaluation, and Pareto-aware search. | Reflection, candidate mutation, and multi-objective selection. | Treat GEPA as an optimizer-engine reference or future optional backend. PatchRace owns the coding-repository substrate, Pi mutation semantics, safety, evidence, and end-user workflow. |
| [Stet](https://www.stet.sh/) | Replays real repository work, compares models/configurations, and lets an agent improve its own setup against evidence. | Private repo evals, instruction changes, historical work, promote/hold decisions. | Do not claim the generic “eval then improve AGENTS.md” loop is unique. Differentiate on fully open/local operation, Pi-native artifact lifecycle, observable cross-agent workflow distillation, no required account, and user-owned reports/artifacts. |
| [Qwen Code Agent Arena](https://qwenlm.github.io/qwen-code-docs/en/users/features/arena/) | Runs multiple models on the same real task in isolated worktrees and lets the user compare/select a result. | Same-task races and worktree isolation. | PatchRace is a durable regression and teaching system across harnesses: repeatable suites, deterministic graders, retained evidence, historical-task mining, diagnosis, candidates, validation, and rollback. |
| [agent-eval-harness](https://github.com/plaited/agent-eval-harness) and generic eval libraries | Provide adapter, pipeline, trace, grading, pass@k, and comparison primitives. | Core evaluation infrastructure. | PatchRace is an opinionated product workflow for coding repositories and Pi improvement, with a five-minute path, reports, safe worktrees, task mining, and promotion semantics. |
| Pi | Provides a programmable coding-agent CLI, JSON events, SDK, skills, prompts, settings, packages, and extensions. | Execution substrate and optimization target. | PatchRace does not fork or replace Pi. It loads controlled Pi variants and produces project-local, reviewable Pi resources. Pi's [JSON mode](https://pi.dev/docs/latest/json) and [Skills model](https://pi.dev/docs/latest/skills) make this technically plausible. |
| Claude Code and Codex | Full coding-agent products for understanding, changing, testing, and reviewing code. Claude exposes scriptable structured CLI output; OpenAI positions Codex across codebase understanding, implementation, testing, and review. | Candidate/teacher runners and complete-harness comparisons. | PatchRace invokes user-installed clients as adapters. It does not proxy accounts, extract credentials, reproduce proprietary prompts, or claim teacher output is ground truth. See [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage) and [OpenAI Codex use cases](https://developers.openai.com/codex/use-cases). |

## Differentiation pillars

### 1. Pi-native resource semantics

Diagnoses map to the smallest correct Pi surface:

- stable project fact or invariant → context guidance;
- task-specific procedure → Skill;
- user-invoked repeatable flow → Prompt Template;
- resource/model/tool selection → Settings recommendation;
- missing deterministic capability → Extension/package recommendation, not silent installation;
- capability gap → model/routing advice rather than instruction bloat.

### 2. Observable workflow distillation

PatchRace compares observable evidence such as file discovery, commands, tests, edits, failures, timing, cost, and patch footprint. It does not need or seek hidden chain-of-thought.

### 3. Correctness-first evidence

Tests and repository acceptance criteria are hard gates. LLM review may add hypotheses or quality dimensions but cannot convert an objectively failing patch into a pass.

### 4. Candidate lifecycle

Every proposed Pi change has lineage, an exact diff, evidence, an ablation, validation results, final holdout status, and rollback. “Generated” never means “automatically trusted.”

### 5. Local ownership

Runs, source, traces, credentials, and reports remain local by default. Publication is separate, redacted, previewed, and opt-in.

## Claims policy

### Allowed after evidence exists

- “PatchRace compares these supported agent configurations on your repository tasks.”
- “This candidate improved the stated metric on this frozen held-out suite.”
- “The report observed these workflow differences.”
- “PatchRace rejected this candidate because it regressed correctness/cost/safety.”
- “PatchRace is Pi-native and supports listed adapter versions.”

### Prohibited or qualified

- Do not say “first self-improving coding agent” or “first agent arena.”
- Do not say one agent/model is universally best.
- Do not call an LLM diagnosis causal proof.
- Do not say a Skill makes Pi permanently smarter.
- Do not call worktree isolation a sandbox.
- Do not promise secret-free reports; say redaction reduces risk and requires review.
- Do not generalize a single-repository case study to all codebases.
- Do not imply affiliation with Pi/Earendil, Anthropic, OpenAI, Qwen, or adjacent projects.

## One-line and long-form positioning

Short:

> PatchRace is the open-source training ground for Pi.

Long:

> PatchRace runs Pi and other coding agents against replayable repository tasks, grades their patches with deterministic evidence, diagnoses observable workflow gaps, proposes reviewable Pi skills and instructions, and promotes only candidates that survive validation and held-out tests.

## Strategic test

The differentiation is falsified if target users consistently use only the comparison report and do not return to diagnosis, candidate review, or regression validation. `BETA-02` must measure repeat use of the teaching workflow rather than Stars or first-run curiosity alone.
