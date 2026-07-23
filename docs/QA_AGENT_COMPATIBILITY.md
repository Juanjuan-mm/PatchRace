# QA-04 Agent CLI Compatibility

Last updated: 2026-07-23

PatchRace validates Agent compatibility in two layers:

1. exact official CLI packages must expose the non-mutating version, help,
   structured-output, isolation, and auth-status surfaces used by the adapter;
2. minimum/current protocol fixtures must complete the same repository task,
   retain raw records, normalize observable evidence, and fail explicitly on
   malformed, oversized, unknown-version, missing-auth, timeout, and
   cancellation cases.

No compatibility check invokes an Agent prompt or model. Version/help probes do
not request credential access, and fixture streams are local deterministic
executables.

## Selected matrix

Registry metadata and packages were read from the official npm distributions on
2026-07-23.

| Adapter | Supported range | Selected minimum | Selected current | Live non-Agent result |
|---|---|---:|---:|---|
| Pi CLI/SDK fallback | `>=0.81.0 <0.82.0` | `0.81.0` | `0.81.1` | PASS: JSON/RPC mode, print, ephemeral session, and resource-disable flags |
| Claude Code | `>=2.1.104 <2.2.0` | `2.1.104` | `2.1.218` | PASS: print `stream-json`, permission/session controls, and `auth status --json` |
| Codex | `>=0.145.0 <0.146.0` | `0.145.0` | `0.145.0` | PASS: `exec --json`, sandbox, ephemeral/config/rules isolation, cwd, and login-status help |

The local official Codex extension binary `0.145.0-alpha.27` also normalizes
inside the selected `0.145.x` protocol profile. The first PATH Codex remains a
broken npm `0.120.0` wrapper and is intentionally rejected by its version
health check; PatchRace never silently switches executable identity.

## Compatibility correction

The earlier declared Claude Code floor `2.1.0` exposed print
`stream-json` but did not expose the required `auth status` command.
Advertising it as fully supported would make PATH presence/version appear
healthy while authentication readiness could not follow the adapter contract.
QA-04 therefore raises the minimum to the already spike-proven `2.1.104`.

Unknown/newer, too-old, malformed-version, malformed-record, and oversized
record cases remain unavailable or explicitly degraded. They never produce a
fabricated complete trace. Authentication failures expose normalized readiness
only; tests assert that environment secret values and vendor error text are not
returned as credentials.

## Reproduction

Install the exact packages into isolated temporary prefixes with lifecycle
scripts disabled where the version/help binary permits it. Set these variables
to the five exact executable paths:

```text
PATCHRACE_QA_PI_MIN
PATCHRACE_QA_PI_CURRENT
PATCHRACE_QA_CLAUDE_MIN
PATCHRACE_QA_CLAUDE_CURRENT
PATCHRACE_QA_CODEX_CURRENT
```

Then run:

```bash
pnpm qa:agents
```

The live verifier writes an ignored
`.artifacts/qa-agent-compatibility.json` containing versions, hashed executable
paths, required help fragments, platform, and PASS/FAIL only. It does not store
absolute executable paths or auth state.

Official distribution references:

- [Pi coding agent on npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
- [Claude Code on npm](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- [Codex on npm](https://www.npmjs.com/package/@openai/codex)
- [Codex non-interactive mode](https://developers.openai.com/codex/non-interactive)

## Residual boundary

Version/help compatibility and deterministic streams cannot prove provider-side
availability or future unannounced stream changes. Live authenticated Agent
tasks remain dogfood work and require exact user authorization and budget.
Ranges stay intentionally narrow; a new minor line remains unsupported until
the same matrix is rerun and reviewed.
