# M0 Product Foundation Review

Review date: 2026-07-22

Result: **PASS**

Reviewer: primary project agent under the user's explicit instruction to execute all M0 tasks

## Requirement-by-requirement audit

| Task | Required evidence | Authoritative artifact | Audit result |
|---|---|---|---|
| `F0-01` | Approved primary persona, promise, required/deferred scope, boundaries, vocabulary | [PROJECT_BRIEF.md](PROJECT_BRIEF.md), [PERSONAS_AND_WORKFLOWS.md](PERSONAS_AND_WORKFLOWS.md) | PASS — brief is marked accepted; primary persona, core promise, v0.1 scope/non-goals, safety/product boundaries, and canonical terms are explicit. |
| `F0-02` | GitHub, npm, domain, and obvious trademark searches; selected names and fallbacks | [NAMING.md](NAMING.md) | PASS — point-in-time results, commands/sources, selected names, semantic risk, legal caveat, launch recheck, and three fallbacks are recorded. No reservation is falsely claimed. |
| `F0-03` | License, copyright holder, contribution terms, Code of Conduct, maintainer model | [GOVERNANCE.md](GOVERNANCE.md), `ADR-011`, `ADR-013` | PASS — Apache-2.0, “PatchRace contributors,” DCO 1.1, Contributor Covenant 2.1, lead-maintainer authority, sensitive review, appointment, and review triggers are decided. |
| `F0-04` | Evidence-backed, non-misleading boundary against named competitors and generic harnesses | [POSITIONING.md](POSITIONING.md) | PASS — EvoSkill, GEPA, Stet, Qwen Arena, generic eval harnesses, Pi, Claude Code, and Codex are compared; allowed and prohibited claims are explicit. |
| `F0-05` | Quantified activation, reliability, dogfood, beta, performance, security, launch, and stop criteria | [SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md), `ADR-015` | PASS — measurable gates and onboarding/teaching/cost/adapter/safety pivot rules are frozen. |
| `F0-06` | Data inventory, trust boundaries, destructive rules, trace/privacy, generated-artifact policy | [THREAT_MODEL.md](THREAT_MODEL.md), `ADR-003`, `ADR-005`, `ADR-007`, `ADR-008`, `ADR-014`, `ADR-016` | PASS — assets, actors, trust diagram, data classes, no-telemetry default, exact destructive rules, threats, mitigations, residual risks, and candidate policy are explicit. |
| `F0-07` | Three personas and five ranked workflows with entry, outcome, failure modes | [PERSONAS_AND_WORKFLOWS.md](PERSONAS_AND_WORKFLOWS.md) | PASS — three launch personas, non-primary users, and W1–W5 include all required elements and beta checks. |
| `F0-08` | Internal consistency; open questions resolved or explicitly deferred | This review plus [DECISIONS.md](DECISIONS.md), [RISKS.md](RISKS.md), [PROGRESS.md](PROGRESS.md) | PASS — consistency and deferral audit below found no unresolved M0 blocker. |

## Consistency audit

### Product and positioning

- The product brief, positioning, personas, and success criteria all identify the Pi Workflow Builder as primary.
- The public promise consistently ends in a validated Pi configuration decision, not only an agent winner.
- Cross-agent support is an evidence/market surface; Pi remains the optimization target.
- The competitor document explicitly avoids novelty and universal-best claims contradicted by existing projects.

Result: consistent.

### Scope and task ledger

- All required v0.1 capabilities map to later tasks in `M1–M11`.
- Deferred cloud, leaderboard, orchestration, sandbox, package installation, and executable Extension generation are not required by a v0.1 milestone exit gate.
- Optimizer pluggability is accepted, but GEPA/EvoSkill integration remains post-launch and does not block the built-in loop.

Result: consistent.

### Evidence and claims

- Deterministic correctness precedes subjective review everywhere.
- Small task counts downgrade claims rather than silently weakening holdout requirements.
- A teacher trajectory is evidence, not ground truth or causal proof.
- The “When Pi loses, it learns” hook is qualified by candidate rejection and holdout gates.

Result: consistent.

### Security and privacy

- Local-first is explicitly distinguished from offline operation.
- Worktree isolation is explicitly not called a sandbox.
- Raw traces may contain secrets; export redaction is risk reduction, not a guarantee.
- Global Pi state, executable generated artifacts, package installs, Git commits/pushes, publication, and telemetry are not automatic.
- Destructive actions fail safe by retaining state when ownership/target is uncertain.

Result: consistent.

### Governance and release

- Apache-2.0, DCO 1.1, lead-maintainer authority, and Contributor Covenant 2.1 are compatible with the planned contributor workflow.
- Exact Code of Conduct/security contact is not invented; `LCH-04` cannot pass until a real contact exists.
- Namespace discovery is not treated as ownership; `LCH-01` remains a hard reservation/recheck gate.

Result: consistent.

## Point-in-time research evidence

Evidence used in M0 includes:

- npm registry returned `E404` for `patchrace` and `pi-patchrace`.
- GitHub public API name search returned zero repositories for `patchrace in:name`.
- Verisign WHOIS returned no match for `patchrace.com`; Google Registry RDAP returned 404 for `patchrace.dev`.
- Preliminary indexed trademark searches returned no obvious exact software mark; legal clearance remains outside this task.
- Pi publicly documents project-local Skills, settings, JSON events, and the fact that project trust is not a sandbox.
- Adjacent projects publicly demonstrate agent arenas, evals, prompt/skill evolution, and repository replay, so PatchRace's claims are deliberately narrower.

Research is dated and must be refreshed when a current external fact becomes release-critical.

## Explicit deferrals, with owners

These are resolved as deferrals rather than open M0 questions:

| Item | Why deferred | Owning task |
|---|---|---|
| Final Node/TypeScript versions, package manager, test/report stack | Requires implementation spikes and dependency evidence. | `ARC-08` |
| Exact adapter flags, auth behavior, structured output, and compatibility ranges | Current CLI behavior must be proven, not assumed from docs. | `SPIKE-01..SPIKE-03`, `ADP-08` |
| Exact Code of Conduct/security reporting contact | Must be a real maintainer-controlled channel at public launch. | `LCH-04` |
| GitHub/npm/domain reservation | External state changes and reservation is not required for local architecture work. | `LCH-01`, `LCH-06`, `LCH-07` |
| Domain purchase | Not required for v0.1; requires an explicit financial action. | Optional launch decision |
| Professional trademark/legal review | Appropriate before material commercial brand investment, not a technical M0 gate. | Lead Maintainer before commercial launch |
| Container/sandbox backend | v0.1 makes no sandbox claim and documents residual execution risk. | Post-launch or future accepted ADR |
| Telemetry | Default is none; any future telemetry requires a new ADR and tests. | Post-launch |

## Risk review

All risks in [RISKS.md](RISKS.md) were reviewed against the frozen product boundaries. None is closed merely by documentation. Every high-impact risk has a later mitigation/evidence task. The following are M1 focal risks:

- `R-001`: CLI compatibility drift;
- `R-002`: worktree/destructive safety;
- `R-003`: trace privacy;
- `R-006`: task/verifier leakage;
- `R-012`: local CLI authentication boundaries;
- `R-014`: installation/dependency weight.

No current risk prevents architecture spikes, provided M1 preserves the M0 boundaries.

## M1 entrance gate

M1 may begin because:

- product scope and non-goals are frozen;
- required contracts/spikes are already enumerated;
- safety and privacy constraints exist before architecture design;
- external facts that must be proven are explicitly assigned to spikes;
- success and pivot criteria can guide trade-offs;
- there is no unresolved M0 dependency or user decision.

Next task: `ARC-01 — Write system architecture RFC`.

## Final decision

`M0 — Product foundation` is complete. Product changes that contradict these accepted artifacts require a superseding ADR and task/scope updates; implementation convenience alone is not sufficient.
