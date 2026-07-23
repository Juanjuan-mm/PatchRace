# M8 Pi Teaching Loop Review

Status: passed 17/17 tasks  
Reviewed: 2026-07-23

## Exit decision

M8 passes. PatchRace can turn eligible evidence-linked Pi diagnoses into narrow,
project-local candidates, place their exact changes and risks before explicit
review, validate one declared mutation under protected split and budget
protocols, preserve raw objective dimensions, request an eligible promotion,
and restore the exact pre-promotion state.

The teaching loop is Pi-native but bounded: global resources are inventory-only,
capability/insufficient evidence does not mutate configuration, generated
extensions/scripts/packages are forbidden, approval enables validation rather
than activation, final holdout is one-time, and promotion remains a separate
confirmed project-local operation.

## Task evidence

| Task | Acceptance evidence |
|---|---|
| `TCH-01` | `inventory.ts` maps explicit project/global origins and precedence, deterministic context estimates, shadowing and bounded smells without content disclosure, mutation, auth discovery, or symlink traversal. |
| `TCH-02` | `routing.ts` sends stable constraints to guidance, procedures to Skills, evidenced user invocation to prompts, tool gaps to manual advice, capability to model advice, and invalid/insufficient evidence to no candidate. |
| `TCH-03` | `candidate.ts` freezes parent/baseline, generator/model/prompt, route/diagnosis/evidence, split/config, one mutation set, exact files, objectives, stable identity, and append-only evaluation history. |
| `TCH-04` | `staging.ts` uses create-new owned candidate roots with exact before/after/diff bytes, no activation, dry-run disposal, owner/hash revalidation, and unrelated-state preservation. |
| `TCH-05` | The guidance generator adds one cited stable fact or removes exact cited conflict/bloat lines and reports line/context deltas under complexity and sensitive-content gates. |
| `TCH-06` | The Skill generator emits narrow valid declarative `SKILL.md` content and rejects executable, installer, credential, hidden/reference, absolute-path, project, and version payloads. |
| `TCH-07` | The prompt generator requires the routed invoked-workflow name, typed documented arguments/placeholders, bounded steps, explicit user invocation, and no automatic action. |
| `TCH-08` | Settings/model/tool recommendations are canonical diffs with evidence and `manualOnly: true`; auth/package/extension/install actions are forbidden and capability advice requests a controlled comparison. |
| `TCH-09` | Candidate review verifies source diagnoses and patch hashes, shows exact diff/risk/effect/cost, renders escaped JSON/HTML, and requires one explicit approve/reject transition with activation always disabled. |
| `TCH-10` | Ablation plans freeze task/adapter/model/harness/budget/environment/scheduler invariants, balance arm order, and reject missing, drifted, or extra resource changes before an evaluator call. |
| `TCH-11` | Task-owned teaching ledgers separate training proposal and validation selection views, hide holdout identities, open one frozen final gate, disable retuning, and require a new manifest for another cycle. |
| `TCH-12` | Successive halving uses enforceable candidate/trial/time/token/cost envelopes, hard-gate-first rejection, a declared correctness screen, and explicit not-fully-evaluated early stopping. |
| `TCH-13` | Objective vectors retain correctness, stability, cost, latency, footprint, context, and complexity with availability/provenance; Pareto selection has no aggregate score and explains frontier/dominators. |
| `TCH-14` | Promotion/rollback previews are read-only; confirmed writes are declared project-local targets only, retain private exact pre/post images, compensate failures, refuse divergence/reuse, and preserve unrelated files. |
| `TCH-15` | `TeachingCommandService` implements phase-addressable `teach pi`; the full tested path composes diagnosis through promotion preview and refuses validation without review, budget, and an explicitly configured evaluator. |
| `TCH-16` | The checked 12-task fixture hides holdout IDs during proposal, freezes candidate/policy before one final gate, improves held-out success from 0 to 1, passes hard gates, and stays inside all predeclared budgets. |
| `TCH-17` | This review, `verify-m8.mjs`, full quality/package gates, Changeset, risk/threat reconciliation, documentation, and control-record updates close the milestone. |

## Leakage, activation, and authority audit

- Proposal views serialize training evidence, validation IDs, and only the
  holdout count/commitment. The demo asserts that no final task ID occurs in the
  proposal bytes.
- The final gate binds one frozen candidate and decision-policy hash, refuses a
  second opening, records the result hash, and sets `retuneAllowed: false`.
- Deterministic facts and hard gates remain authoritative. Reflection,
  capability, unknown, invalid-integrity, and insufficient-evidence outcomes
  cannot acquire mutation authority.
- Candidate generators emit bounded Markdown or inert recommendation data.
  They cannot generate executable Extensions, scripts, hooks, package
  installation, credentials, or global destinations.
- Staging never writes active `.pi` or `AGENTS.md` resources. Review approval
  enables validation only. `teach pi` returns a promotion preview; it does not
  promote.
- Promotion requires a separate confirmation and exact preimage. Rollback
  requires the exact promoted postimage and never overwrites user divergence.
- HTML uses a default-deny CSP and escapes task, diagnosis, and diff content.
  Raw candidate/review/promotion artifacts remain local-sensitive.

## Objective and claim audit

Correctness, safety, protected paths, and integrity precede all optimization.
Success, stability, cost, latency, footprint, context, and configuration
complexity remain distinct values with units, availability, sample/task/repeat
support, intervals where available, and source hashes. Unknown cost is
unavailable, never zero. Pareto dominance requires no worse value in every
dimension and at least one strict improvement; no opaque weighted score exists.

The M8 demo is deterministic fixture evidence for the Pi resource and teaching
protocol. It is not a live Pi model benchmark, cross-vendor comparison, or
general improvement claim. Representative private repositories, live
authenticated evaluators, broader sample sizes, and user evidence remain later
quality/beta work.

## Verification

- `pnpm check` passed formatting, ESLint, strict TypeScript, 61 test files/184
  tests, base fixture verification, intentional quality-failure detection, and
  build/schema generation.
- `pnpm m8:demo` rebuilt and byte-matched the canonical 12-task held-out result.
- `pnpm m8:verify` passed all 17 task rows, required implementation/test/docs
  artifacts, split/leakage/no-activation/no-score/promotion controls, demo
  result, Changeset, risks, threats, and progress.
- `pnpm release:pack` built and dry-packed all nine public packages without
  publishing.

No Agent/provider call, vendor authentication, Keychain access, credential
lookup, telemetry, publication, commit, branch mutation, global Pi write, or
paid test occurred. One approved `pnpm install` refreshed the existing locked
development tree and new workspace link after an offline store miss; it added no
external dependency and downloaded no package bytes.

## Residual limitations

- The held-out improvement uses a deterministic public fixture, not a live Pi
  model. It validates protocol behavior but not external model generalization.
- The default CLI intentionally has no implicit evaluator. It can diagnose,
  propose, stage, and review; validation requires an explicitly configured
  evaluator and separate Agent/budget authorization.
- Static review HTML is inert; typed service/CLI decisions are the source of
  truth. A richer Pi-native TUI belongs to M9.
- Candidate/teaching reports are local-sensitive and are not automatically
  included in the shareable redacted export.
- Multi-file filesystem promotion uses compensation around atomic per-file
  writes; host crashes between files may require the retained promotion record
  and manual recovery hardening in M10.
- Worktrees and project-local resource roots remain repository isolation, not
  host containment.

## M9 entrance

`PI-01` is dependency-ready. The Pi package must delegate to these stable
services, preserve explicit review/promotion/rollback authority, and avoid
duplicating durable state in the UI layer.
