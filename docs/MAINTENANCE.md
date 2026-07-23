# Project Record Maintenance Protocol

Last updated: 2026-07-22

These rules keep future implementation sessions coherent. The user can request work by stable task ID, for example: “执行 `SPIKE-01`”.

## Source of truth

- Repository-wide agent contract: [`../AGENTS.md`](../AGENTS.md)
- Product scope: [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
- Milestone sequencing and gates: [EXECUTION_PLAN.md](EXECUTION_PLAN.md)
- Task definitions and status: [TASKS.md](TASKS.md)
- Current snapshot and queue: [PROGRESS.md](PROGRESS.md)
- Architectural/product decisions: [DECISIONS.md](DECISIONS.md)
- Active risks: [RISKS.md](RISKS.md)
- Historical sessions: [SESSION_LOG.md](SESSION_LOG.md)

When records disagree, do not silently pick one. Resolve the conflict and update all affected records in the same task.

## Starting a task

1. Read the repository-root `AGENTS.md` by its fixed path; do not rely on Git, ignore-aware, or recursive file enumeration to discover it.
2. Read the task row, its dependencies, current progress, relevant decisions, and risks.
3. Verify all dependencies are `DONE`; otherwise report the dependency rather than bypass it.
4. Change exactly one primary task to `DOING` in `TASKS.md`.
5. Set it as active in `PROGRESS.md` and record the intended acceptance checks.
6. If scope or architecture must change, update or add an ADR before broad implementation.

## Completing a task

A task is `DONE` only when:

- its stated deliverable exists;
- every acceptance condition is verified;
- relevant tests/checks have run, or a documented reason explains why they cannot;
- related documentation is updated;
- new risks and decisions are recorded;
- `TASKS.md`, `PROGRESS.md`, and `SESSION_LOG.md` are updated in the same change.

Then:

1. Mark the task `DONE`.
2. Recalculate the milestone completed count.
3. Select the next dependency-ready task and mark it `NEXT`; do not mark it `DOING` until work begins.
4. Add evidence links or commands to the session entry.
5. Update the `Last updated` date on every changed project-control file.

## Blocking a task

Use `BLOCKED` only when the task cannot make meaningful progress without a missing decision, permission, external state, or unmet dependency. Record:

- exact blocker;
- what was attempted;
- affected milestone/date;
- unblock condition;
- useful work that can proceed elsewhere.

## Adding or changing tasks

- Never reuse or renumber a stable ID.
- Add the next numeric suffix in the matching prefix.
- Include priority, dependencies, concrete deliverable, and testable acceptance.
- For v0.1 scope expansion, identify which existing task is replaced or record a scope ADR.
- Use `DROPPED` rather than deleting tasks with historical work.

## Milestone reviews

At each review task:

1. Verify every required task is `DONE` or explicitly deferred by accepted ADR.
2. Review all open risks touching the milestone.
3. Re-run the milestone's clean-room or end-to-end acceptance flow.
4. Record actual evidence and deviations from the plan.
5. Update estimates and immediate queue without rewriting history.

## Session-log template

```markdown
## YYYY-MM-DD — TASK-ID Short title

- Status: DONE | BLOCKED | PARTIAL
- Goal:
- Changes:
- Verification:
- Decisions/risks:
- Remaining work:
- Next recommended task:
```

## User-facing task handoff

At the end of an implementation task, report:

- outcome first;
- files/artifacts changed;
- verification performed and result;
- residual limitations or risks;
- updated task status;
- next dependency-ready task ID.

## Local E2E credential registry

This section records retrieval metadata only. Never store credential values in the repository, task ledger, session log, run artifacts, shell history, or command output.

| Provider | Runtime environment variable | Local secret store | Status |
|---|---|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` | macOS Keychain generic password: service `patchrace-deepseek-api-key`, account `deepseek` | Available on this development machine from 2026-07-22 |

Safe retrieval rule for a single authorized E2E process:

```bash
DEEPSEEK_API_KEY="$(security find-generic-password -a deepseek -s patchrace-deepseek-api-key -w)" <command>
```

- Never run the Keychain lookup with `-w` as a standalone diagnostic because that prints the secret.
- Never log the constructed environment or pass the key as an argv/config value.
- Keep the key out of repository setup, grader, agent-visible prompts, raw traces, reports, and exported artifacts.
- Record only auth readiness (`ready|missing|expired|unknown`) in PatchRace evidence.
- The API base URL and model remain explicit test configuration; do not infer them from the presence of this credential.
- If the credential is rotated, update the same Keychain item and its metadata date without recording the old or new value here.
