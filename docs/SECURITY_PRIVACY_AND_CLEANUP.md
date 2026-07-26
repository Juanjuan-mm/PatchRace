# Security, Privacy, and Cleanup Guide

Last updated: 2026-07-23

PatchRace is a local orchestration and analysis tool. It is **not a sandbox**.
It starts repository commands, graders, Agent CLIs, and optionally Pi workflows
with the operating-system authority of the user who launched it. Git worktrees
separate repository state; they do not isolate the filesystem, processes,
credentials, network, or vendor services.

Use PatchRace only on repositories and executable inputs you trust at the same
level as running their build and test commands directly. The detailed
implementation evidence is summarized in [verification](VERIFICATION.md), and
the current boundaries are defined in the [threat model](THREAT_MODEL.md).

## Trust checklist before a run

Review and explicitly authorize:

- the exact repository and commit;
- setup, build, test, grader, and trusted-shell commands;
- dependencies and package lifecycle behavior;
- the selected Agent executable, version, model, account, and budget;
- network requirements and what the Agent vendor may receive;
- hidden verifier placement and whether the backend can actually enforce
  separation;
- project Pi guidance, Skills, prompts, settings, Packages, and Extensions.

PatchRace uses executable/argument arrays without a shell for normal process
launches. An explicitly declared trusted-shell grader remains arbitrary
host-executable code. A warning or worktree does not make malicious code safe.
On Windows, the Pi extension validates the exact adjacent npm package behind
`patchrace.cmd` and invokes its JavaScript entry with Node instead of evaluating
the shim in `cmd.exe`.

Agent CLIs use their normal local authentication and vendor behavior. PatchRace
probes normalized readiness such as `ready`, `missing`, `expired`, or `unknown`;
it does not enumerate, extract, copy, or persist vendor tokens. The vendor CLI
may independently read its auth store and transmit repository context according
to its own account and configuration. “Local-first” means PatchRace has no
hosted service or automatic telemetry; it does not mean models operate offline.

## What remains on the machine

Raw runs are local-sensitive and persist until explicit cleanup. Depending on
the run, they can include:

- source patches, prompts, Agent messages, raw vendor bytes, normalized traces,
  commands, outputs, paths, errors, timing, and usage;
- task/config/baseline/executable hashes and normalized version/auth readiness;
- grader inputs and results, report JSON/HTML, diagnosis, candidate review,
  validation, promotion, and rollback records;
- partial evidence from failed, interrupted, cancelled, or budget-stopped
  attempts.

Environment variable values and credential contents are not intentionally
persisted, but repository commands, Agent output, or unknown secret formats may
copy sensitive values into raw evidence. Treat the complete `.patchrace/runs`
tree, local reports, diagnosis, candidates, cleanup previews, and incident
bundles as confidential unless you have inspected every selected file.

Completed raw evidence is append-only. Recovery preserves malformed and partial
bytes when possible because mutable status alone is not sufficient evidence.
Runs are not automatically deleted. Only cache is automatically disposable
under a configured retention policy.

## Packages, Pi resources, and generated content

Dependencies and Agent/Pi packages execute with user authority. Use the frozen
lockfile and reviewed package contents; do not assume that an upstream package,
new version, install hook, or registry account is safe because an earlier audit
passed. PatchRace v0.1 package manifests contain no install lifecycle scripts,
but repository dependencies may.

Pi Skills and guidance are instructions that can change Agent behavior.
Extensions, hooks, packages, and scripts are executable. PatchRace candidate
generation permits only bounded declarative project-local guidance, Skills, and
prompts, plus inert manual recommendations. It rejects generated executable
Extensions/scripts/hooks, package or auth actions, credentials, hidden/reference
material, and global destinations.

A generated candidate remains untrusted and local-sensitive. Staging does not
activate it; review approval authorizes validation only. Promotion is a separate
previewed and confirmed operation to declared project-local paths. It never
installs a package, changes global Pi state, commits, or pushes. Rollback checks
the exact promoted postimage and refuses to overwrite user divergence.

## Reports, redaction, and publication

The full local report is not safe to publish. It can contain code, paths,
observable traces, executable details, and free text. PatchRace first creates a
separate `report/shareable/` projection that removes patches, changed paths,
trajectories, evidence links, executable/harness/workflow details, environment
names, and free-text trial limitations.

Preview an export:

```bash
patchrace report run_01J... --format json --redacted --preview --output ./review-export
```

After inspecting the preview and its exact source/destination, create the copy:

```bash
patchrace report run_01J... --format json --redacted --confirm-export --output ./review-export
```

The export:

- accepts only the shareable projection, never the complete local report or raw
  artifacts;
- reloads the frozen run configuration and reads only explicitly named runtime
  redaction values;
- handles reviewed typed fields and raw/JSON/HTML forms within a 16 MiB
  per-document safety bound;
- refuses in-place or existing destinations, source/config drift, missing
  configured values, symbolic/hard-link sources, and oversized files;
- records included/excluded classes, hashes, findings, and an unknown-secret
  warning without recording configured secret values.

Redaction is risk reduction, not a guarantee. Unknown/transformed secret
formats, images, binaries, archives, inferred personal data, and human mistakes
can survive. The size bound prevents unbounded processing; it does not certify
content as safe. Review every exported file manually.

Export is local file creation, not publication. PatchRace v0.1 has no upload
endpoint, telemetry, analytics, crash upload, trace upload, or automatic report
upload. A public GitHub source repository does not change this boundary. The
optional OTLP/JSON export is also create-new, local, explicitly confirmed, and
has no network transport. A later manual upload cannot be retracted by
PatchRace cleanup.

## Safe cleanup

Cleanup is dry-run by default. Always begin with one exact recorded target:

```bash
patchrace clean --run run_01J... --dry-run
```

The preview lists canonical exact targets, ownership evidence, retention class,
and estimated bytes. To remove only owned worktrees:

```bash
patchrace clean --run run_01J... --worktrees --confirm
```

To include raw run artifacts, select them explicitly only after retaining any
incident evidence you need:

```bash
patchrace clean --run run_01J... --artifacts --confirm
```

Cache cleanup is a separate exact policy:

```bash
patchrace clean --cache --older-than 30d --confirm
```

Before deletion, PatchRace revalidates canonical descendants, recorded
ownership, file type/link count, hashes where required, Git worktree identity,
and process-group provenance. It refuses repository roots, home/broad roots,
unrecorded paths, unresolved variables, traversal, link escapes, ownership
swaps, and ambiguous targets. Git cleanup is serialized. Cancellation signals
only the recorded process group; PatchRace never kills by executable name.

If ownership, a link, PID identity, worktree state, or finalized hash is
ambiguous, retention is the safe outcome. Do not bypass the refusal with a broad
recursive delete. Preserve unrelated branches, worktrees, files, caches, user
configuration, and raw evidence. Cleanup cannot undo vendor disclosure,
published output, a commit/push performed separately, or hostile code that has
already run.

## Recovery and interrupted runs

On restart, recovery validates the owned run root and lease, parses only complete
event records, quarantines an invalid final partial record, verifies finalized
hashes and worktree ownership, and avoids signaling an unrelated or reused PID.
It resumes only idempotent unstarted/finalization/grading steps. A paid Agent
retry becomes a new explicit attempt with lineage.

When the system reports `CONFLICT`, `SAFETY`, `GRADER`, corrupt evidence, or
`needsInspection`, keep the run unchanged until you understand the cause. A
readable partial artifact or explicit recoverable state is preferable to a
clean-looking but unverifiable result.

## Security or privacy incident

If you suspect unexpected command execution, unrelated-state mutation,
credential exposure, hidden-verifier leakage, malicious report content,
unsafe cleanup, or an incorrect public export:

1. stop further Agent/provider and publication actions;
2. if a PatchRace child is still running, request normal cancellation; do not
   kill unrelated processes by name;
3. disconnect network access or revoke/rotate affected credentials through the
   owning vendor when exposure is plausible;
4. preserve the exact run directory, artifact index, raw streams, terminal
   output, config/task hashes, executable/adapter versions, timestamps, and
   cleanup preview;
5. copy evidence to an access-controlled location without editing the original;
   do not attach raw runs, secrets, private source, or hidden verifier material
   to a public issue;
6. record the PatchRace version, operating system, Node/Git/Agent versions,
   command shape with secrets removed, expected behavior, observed behavior,
   impact, and whether data left the machine;
7. use the project's private vulnerability-reporting channel, then follow
   maintainer instructions before cleanup or disclosure.

Use the repository's GitHub private vulnerability reporting flow described in
[`SECURITY.md`](../SECURITY.md): **Security → Advisories → Report a
vulnerability**. This is the real private reporting endpoint controlled by the
repository owner. If the control is unavailable, open a public issue containing
only “private security contact needed” and no technical or sensitive detail.
Preserve the evidence locally and do not post exploit details publicly.

Confirmed unrelated-state deletion, credential disclosure, invalid grading,
holdout leakage, or unsafe publication blocks release regardless of aggregate
test results.

## Actions PatchRace never performs automatically

PatchRace v0.1 does not automatically:

- upload telemetry, crashes, traces, reports, code, or artifacts;
- publish an export or label a complete local report public-safe;
- enumerate or extract vendor credentials;
- install or update Agent/Pi packages or generated Extensions;
- activate a generated candidate, change global Pi state, commit, or push;
- retry a paid Agent call without a new recorded attempt;
- delete raw runs, existing branches, user worktrees, unrelated files, or user
  configuration;
- claim worktrees are a host sandbox or redaction is a secrecy guarantee.
