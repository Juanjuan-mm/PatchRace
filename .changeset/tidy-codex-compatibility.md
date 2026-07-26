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
