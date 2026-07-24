# Threat Model and Privacy Boundaries

Last reviewed: 2026-07-23

## Security posture

PatchRace is a local orchestration and analysis tool, **not a sandbox**. It
invokes coding agents and repository commands with the permissions of the user
who started it. Git worktrees isolate repository state; they do not isolate the
filesystem, processes, credentials, network, or model providers.

Users must review repositories, setup commands, verifier commands, generated
artifacts, and agent configuration before execution.

## Protected assets

1. Source code, uncommitted changes, branches, worktrees, and repository
   history.
2. Environment variables, auth stores, API credentials, and signing material.
3. Prompts, model messages, commands, paths, patches, traces, and reports.
4. Hidden tests, reference patches, task splits, and grading integrity.
5. Pi configuration, Skills, prompts, packages, and extensions.
6. Compute, provider quota, time, disk, and network resources.
7. Release artifacts, dependencies, and project reputation.

## Trust boundaries

```text
User terminal
  ├─ PatchRace controller and local artifact store
  ├─ repository and PatchRace-created worktrees
  ├─ external agent CLI processes
  │    └─ vendor model services
  ├─ repository setup/test/verifier processes
  ├─ generated Pi candidate staging area
  └─ explicit export destination
```

Repository content, generated content, imported artifacts, agent output, and
external model services are untrusted. Crossing into a model provider or an
export destination is a disclosure boundary. “Local-first” does not mean that
configured agents operate offline.

## Principal threats

| ID | Threat | Mitigation |
|---|---|---|
| `T-01` | Repository text prompt-injects an agent into reading secrets or changing unrelated files. | Constrain declared roots where supported, keep hidden assets out of context, record observable actions, and state that host sandboxing is absent. |
| `T-02` | Setup, test, build, or verifier scripts execute malicious code. | Require explicit repository-command trust and show commands before execution. |
| `T-03` | Task/config values cause command injection. | Prefer executable/argument arrays, validate schemas, and make shell use explicit. |
| `T-04` | Paths or links escape artifact/worktree/cleanup roots. | Canonical descendant checks, no-follow single-link file operations, ownership records, and exact-target cleanup. |
| `T-05` | Cleanup removes user Git state or signals unrelated processes. | Record worktree/process provenance, preview exact targets, revalidate at execution, and retain on ambiguity. |
| `T-06` | An agent edits graders or obtains hidden verifier material. | Inject hidden material only after the agent phase, hash inputs, inspect protected paths, and fail compromised integrity. |
| `T-07` | Trace/report/export exposes secrets or private code. | Keep raw evidence local, create a separate minimized export, redact configured values, preview, confirm, and require human review. |
| `T-08` | Generated HTML executes untrusted content. | Escape content and use a default-deny CSP with no script or remote resources. |
| `T-09` | PatchRace extracts or persists vendor authentication material. | Use normal CLI authentication, pass only declared environment names, and record readiness rather than tokens. |
| `T-10` | Runaway trials exhaust cost, time, disk, or quota. | Enforce wall/trial/token/cost/disk/concurrency budgets and never retry paid work silently. |
| `T-11` | Dependencies or release artifacts are compromised. | Exact lock integrity, minimal runtime dependencies, license/advisory checks, and package-content allowlists. |
| `T-12` | A candidate overfits and degrades future Pi behavior. | Separate proposal, validation, and holdout data; ablate one mutation; require explicit promotion and rollback. |
| `T-13` | Imported artifacts exhaust resources or exploit parsers. | Apply size/count/depth limits, schema validation, inert parsing, and malformed-input tests. |
| `T-14` | Reference patches or holdouts leak into candidate generation. | Bind split commitments and restrict inputs by phase. |
| `T-15` | Vendor/version differences make comparisons misleading. | Record exact provenance, keep model/harness/workflow dimensions separate, and represent missing metrics as unavailable. |

## Data handling

- Raw run evidence is local-sensitive and may contain secrets.
- PatchRace has no automatic product telemetry or artifact upload.
- A redacted export is a separate copy; it never replaces raw evidence.
- Redaction reduces known risk but cannot guarantee removal of unknown,
  transformed, encoded, or model-reproduced secrets.
- Generated instructions, prompts, settings, and Skills remain untrusted until
  reviewed and validated.
- PatchRace never silently changes global Pi state, installs third-party Pi
  packages, commits, pushes, publishes, or promotes a candidate.

## Cleanup and recovery

Cleanup is dry-run first and limited to canonical recorded descendants of a
PatchRace-owned run root. Confirmation revalidates ownership and links
immediately before deletion. Unresolved paths, broad roots, repository roots,
home directories, symlink escapes, ownership drift, or ambiguous worktrees fail
closed and retain state for manual recovery.

Process timeout/cancellation targets only the recorded process group. PatchRace
does not kill by executable name.

## Residual risk

Trusted repository or agent processes can still compromise the host because
PatchRace is not a sandbox. Providers handle data under their own CLI/account
configuration. Cost data may be missing or delayed. Same-user hostile races,
power loss, unknown secret formats, and model inference cannot be eliminated by
the current controls.
