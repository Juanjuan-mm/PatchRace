---
"@patchrace/contracts": patch
"@patchrace/core": patch
"@patchrace/adapters": patch
"@patchrace/tasks": patch
"@patchrace/diagnosis": patch
"@patchrace/optimizer": patch
"@patchrace/report": patch
"patchrace": patch
"pi-patchrace": patch
---

Pass configured environment allowlists to non-secret doctor auth probes,
support the Codex CLI 0.146 release line, fix synchronous budget-stop
scheduling, preserve task token/cost limits in adapter invocations, and give
Claude Code an explicit non-interactive task tool allowlist and cost ceiling.
Keep the live parity profile's required package-engine edits independent from
its exact dependency-field and lockfile protections, and distinguish aggregate
cost authorization from the enforceable single-trial Claude Code ceiling. State
the public cross-platform acceptance matrix directly in the Agent instruction.
