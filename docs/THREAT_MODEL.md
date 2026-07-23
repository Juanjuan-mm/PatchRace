# Threat Model and Privacy Boundaries

Accepted: 2026-07-22
Implementation review updated: 2026-07-23

The principal threats and trust boundaries below are the accepted M0 baseline.
Milestone sections preserve subsequent implementation evidence. `QA-06`
completed the implementation security review; `QA-07` remains the dedicated
privacy/redaction review before release.

## Security posture

PatchRace is a local orchestration and analysis tool, **not a sandbox**. It invokes coding agents and repository commands with the permissions of the user who started it. Pi's own security documentation similarly states that project trust is not a sandbox and that Pi runs inside the user's local trust boundary. See [Pi Security](https://pi.dev/docs/latest/security).

Therefore:

- users must only execute repositories, setup commands, tests, and generated artifacts they trust;
- worktree isolation protects repository state from concurrent edits but does not isolate the host, credentials, network, or processes;
- optional container/remote sandbox integration may reduce risk later but is outside the v0.1 security promise;
- documentation must never present worktrees as protection against malicious code.

## Protected assets

1. User source code, uncommitted changes, branches, worktrees, and repository history.
2. Credentials in environment variables, config files, keychains, CLI auth stores, Git remotes, and shell history.
3. Prompts, agent messages, tool inputs/outputs, screenshots, local paths, and normalized traces.
4. Hidden tests, verifier assets, reference patches, task splits, and grading integrity.
5. Pi global/project configuration, Skills, Prompts, Settings, Packages, and Extensions.
6. Run artifacts, reports, baselines, candidate lineage, and promotion decisions.
7. User compute, API/subscription quota, time, disk, and network resources.
8. Release credentials, npm/GitHub identities, signing material, and project reputation.

## Actors and trust assumptions

| Actor/input | Default trust |
|---|---|
| User and explicitly approved local configuration | Trusted to authorize scope, but can make mistakes. |
| Existing repository content and history | User-controlled but may contain malicious instructions/scripts; execution is not automatically safe. |
| Repository dependencies, setup, tests, and build scripts | Executable and untrusted until the user accepts the repository's risk. |
| Pi, Claude Code, Codex binaries and model services | External trusted dependencies within declared supported versions; outputs remain untrusted data/actions. |
| Agent/model-generated commands and patches | Untrusted until constrained, reviewed, graded, and approved. |
| Mined task metadata and human reference patches | Evidence sources, not automatically valid or leakage-free. |
| Third-party Pi packages/Skills/Extensions | Untrusted executable/instruction content; never installed automatically. |
| Public reports, HTML, JSON, logs, imported traces | Untrusted input that may contain active content or secrets. |
| PatchRace release artifacts and dependencies | Trusted only through release/provenance controls; supply-chain compromise remains possible. |

## Trust boundaries

```text
User terminal
  ├─ PatchRace controller and local artifact store
  ├─ Git repository and PatchRace-created worktrees
  ├─ External agent CLI processes
  │    └─ vendor model services over network
  ├─ repository setup/test/grader processes
  ├─ generated Pi candidate staging area
  └─ explicit export boundary
       ├─ local HTML/JSON
       └─ user-selected public/private destination
```

Crossing into an external model service or export destination is a disclosure boundary. PatchRace must not imply that “local-first” means models operate offline.

## Data inventory and default handling

| Data | Sensitivity | Default handling |
|---|---|---|
| Source code and patch | Confidential/private unless repository is public | Local run/worktree/artifact only; sent to agent vendor according to that CLI's behavior and user account. |
| Prompts and agent messages | Potentially confidential/personal | Local artifacts plus vendor processing; never sent to a PatchRace service in v0.1. |
| Tool inputs/outputs and commands | May contain code, paths, secrets, production data | Local, redacted only for explicit export; raw local evidence may still contain secrets. |
| Environment variables and auth stores | Secret | Never intentionally persisted; never enumerate or extract vendor tokens; logs must mask configured/known secrets. |
| CLI auth status/version | Low to sensitive | Record readiness/version only; never record token contents. |
| Test/verifier results | Internal/project data | Local by default; redacted export on request. |
| Normalized metrics | May reveal repository/team behavior | Local; no telemetry by default. |
| Candidate Pi artifacts | Potentially dangerous instructions | Staged project-locally, reviewed, scanned, validated, then explicitly promoted. |
| Public report | Intentionally public only after approval | Redaction preview plus explicit destination/confirmation; user remains final reviewer. |

## Telemetry policy

v0.1 has no automatic product analytics, crash upload, trace upload, or usage telemetry.

If telemetry is proposed later, it requires an accepted ADR defining:

- exact fields and purpose;
- opt-in/opt-out behavior;
- retention and deletion;
- processor/destination;
- whether any source, prompt, path, command, patch, or persistent identifier can appear;
- offline behavior and a test proving telemetry is disabled by default.

## Destructive-operation rules

1. Canonicalize and validate every path before creating, moving, or deleting.
2. Destructive targets must be descendants of an explicit per-run root created and recorded by PatchRace.
3. Refuse unresolved variables, broad roots, home directories, repository roots, symlink escapes, and glob-derived destructive targets.
4. Never delete pre-existing user branches, worktrees, stashes, commits, untracked files, or unrelated temp directories.
5. Cleanup supports dry run and lists exact targets.
6. On uncertainty, retain artifacts/worktrees and report manual recovery steps rather than guessing.
7. Worktree creation records provenance and validates Git's actual worktree list before cleanup.
8. Process cancellation targets only recorded process groups started by the run.
9. Promotion never commits, pushes, publishes, or changes global Pi files without separate explicit user authorization.
10. Hidden verifier injection and cleanup must not overwrite a user's working tree.

## Generated-artifact policy

For v0.1:

- generated `AGENTS.md`, `SKILL.md`, prompt, and settings candidates are untrusted;
- candidates live in an isolated staging location/branch and are shown as an exact diff;
- candidate lineage cites diagnoses and evidence;
- only one declared mutation set is active in an ablation;
- no generated executable scripts or TypeScript Extensions are promoted automatically;
- package recommendations are informational and never auto-installed;
- global Pi configuration is read for inventory only where authorized and is never written silently;
- promotion requires explicit review and supports exact rollback.

## Principal threats

| ID | Threat | Required mitigation direction |
|---|---|---|
| `T-01` | Malicious task/repo text prompt-injects an agent into reading secrets or changing unrelated files. | Scope worktrees, constrain paths/tools where adapters support it, do not expose hidden assets, record actions, warn that host sandboxing is absent. |
| `T-02` | Setup/test/build scripts execute malicious code. | Require trusted repository acknowledgment; keep this risk explicit; support future sandbox adapters without claiming v0.1 isolation. |
| `T-03` | Command injection through task/config values. | Structured process arguments where possible, strict schemas, no implicit shell interpolation, escaping tests, explicit shell fields when unavoidable. |
| `T-04` | Path traversal or symlink escape during artifact/worktree/cleanup operations. | Canonical path checks, no-follow behavior where appropriate, exact run-root ownership, malicious fixtures, dry-run cleanup. |
| `T-05` | Cleanup kills unrelated processes or removes user Git state. | Record PID/process group and worktree provenance, verify ownership/liveness, fail safe by retaining state. |
| `T-06` | Agent or candidate edits grader/hidden tests. | Verifier outside agent-visible tree, post-run injection, immutable config hash, integrity checks, violation as hard failure. |
| `T-07` | Trace/report exposes secrets or private code. | Local raw artifacts, redaction pipeline, export preview, opt-in publication, prominent residual-risk warning. |
| `T-08` | Generated HTML report executes injected script. | Escape all untrusted content, strict CSP for report, avoid remote scripts, security fixtures for HTML/URL injection. |
| `T-09` | PatchRace extracts or logs vendor authentication material. | Invoke official CLI auth only, read version/readiness rather than token files, scrub env/logs, never reverse engineer auth. |
| `T-10` | Cost/wallet denial through runaway trials or retries. | Hard run/time/cost/concurrency budgets, cancellation, preflight estimate, no unbounded retry, honest unknown-cost labels. |
| `T-11` | Dependency or published package supply-chain compromise. | Lockfile, minimal dependencies, package-content dry run, provenance/signing as selected, audit/license checks, protected publishing. |
| `T-12` | Candidate overfit silently degrades future Pi behavior. | Evidence tiers, ablation, validation/holdout, complexity budget, explicit promotion, monitoring and rollback. |
| `T-13` | Imported trace/artifact exploits parser or exhausts memory/disk. | Size/depth/count limits, streaming parsers, schema validation, no code execution, malformed-input tests. |
| `T-14` | Private reference patch or holdout leaks into proposer context. | Split hashes, access separation, one-time holdout gate, auditable candidate inputs. |
| `T-15` | Vendor or version differences make comparison misleading. | Record exact versions/configuration, label unavailable metrics, separate model/harness/workflow claims, compatibility tests. |

## Privacy and retention boundaries

- Raw run artifacts remain until the user explicitly cleans them or applies a configured local retention policy.
- Automatic retention cleanup, if added, must use the same exact-target safety rules and be disabled until tested.
- Redacted exports are separate artifacts; raw evidence is never overwritten and then mistaken for safe export.
- Reports must enumerate included artifact classes before publication.
- A “redacted” label means configured scanning was performed, not that absence of secrets is guaranteed.
- User deletion must explain what was removed and what may remain in Git history, vendor services, caches, or external destinations.

## Residual risks accepted for M0

- Coding-agent vendors receive data according to their own CLI/account configuration; PatchRace cannot make those services local.
- Running repository code can compromise the host because v0.1 is not a sandbox.
- Secret redaction is probabilistic/incomplete for unknown formats.
- Models may infer or reproduce sensitive content already present in context.
- Exact vendor cost may be unavailable under subscriptions or delayed accounting.

These residual risks must be visible in onboarding and documentation. They are not reasons to weaken the release gates.

## M5 implementation review

M5 adds concrete controls for `T-03`, `T-04`, `T-06`, and `T-14`: strict task
schemas and explicit argv/trusted-shell modes; canonical task/asset/evidence and
grader-worktree paths; immutable task/config/reference hashes; external hidden
verifier roots with post-Agent create-new injection; protected and ignored-path
inspection; Agent prompt/root/patch leakage scans; deterministic split
commitments and phase authorization; and final holdout gate records. Integrity
violations are hard `compromised` results even if verifier commands pass.

These controls do not turn a worktree into a sandbox. On host-only execution,
hidden-verifier integrity is `unknown` because a process with user permissions
may search outside its cwd and transformed secret content may evade exact
scanning. Only a backend that actually enforces the declared filesystem boundary
may report `valid`. Raw verifier and repository evidence remains local-sensitive,
and repository/setup/verifier commands remain trusted executable input.

## M6 implementation review

M6 adds concrete controls for `T-03`, `T-07`, `T-08`, `T-10`, `T-13`, and
`T-15`: the CLI refuses host command execution until repository trust is
explicit; plans freeze canonical task/variant dimensions before work; concurrency
and wall/trial/token/cost/disk limits use the shared scheduler; patches and traces
are bounded inert data; HTML escapes all untrusted content under a default-deny
CSP with no scripts or remote resources; machine formats escape XML or use
canonical JSON; and every comparison retains exact adapter/model/harness/workflow
provenance plus unavailable fields.

Shareable reports cross an explicit export boundary. Preview selects only derived
report files, records source/export hashes and redaction findings, excludes raw
streams/prompts/source patches/unselected artifacts, and warns that unknown
secrets may remain. Export requires a distinct destination, matching preview,
and confirmation; it is create-new and never rewrites raw local evidence.

These controls do not make Agent or repository execution safe against malicious
host code. Worktrees remain repository isolation only, hidden verifier integrity
remains `unknown` without an enforcing backend, and generated evidence links are
local-sensitive until reviewed/redacted. The checked public demo contains only
captured/synthetic public fixture evidence and makes no claim about live vendor
auth, quality, or containment.

## M7 implementation review

M7 adds controls for `T-07`, `T-08`, `T-13`, and `T-15`: diagnosis consumes only
normalized observable events and immutable grade/result artifacts; report
construction resolves every cited run/trial/hash/event/gate against an allowlist;
unknown fields and dangling citations fail closed; HTML escapes all untrusted
content under a default-deny CSP; and model capability requires controlled
same-task/adapter/harness/workflow peers rather than cross-vendor intuition.

Optional reflection is a disclosure boundary. The provider interface receives
only an explicitly marked redacted, bounded, allowlisted evidence bundle plus
frozen facts. Strict schema validation rejects replacement facts and forged
citations. Hypotheses remain low-confidence with no mutation authority. The CLI
does not configure a live provider in M7 and refuses `--reflect` before any
provider call.

Raw diagnosis and explicit local `--output` remain local-sensitive; neither is a
shareable/redacted label. M7 does not weaken the existing export boundary, erase
raw evidence, infer missing events, expose hidden reasoning, execute report
content, or mutate Pi configuration. Synthetic labeled quality evidence cannot
establish accuracy on arbitrary private repositories, and worktree/hidden
verifier containment limitations remain unchanged.

## M8 implementation review

M8 adds concrete controls for `T-04`, `T-06`, `T-08`, `T-10`, `T-12`, and
`T-14`: inventory and staging refuse symlink/path escapes; candidate identity
commits exact diagnoses, evidence, split/config, declared files, and hashes;
generators forbid executable/package/credential/hidden/reference/global
payloads; review and report HTML escape untrusted content under a default-deny
CSP; search and trials have hard enforceable budgets; and one-variable resource
snapshots fail before evaluation on any extra change.

Training proposal and validation selection views are distinct. Proposal sees
only a final-holdout count and commitment. The final gate binds a frozen
candidate/policy, opens once, records its result, disables retuning, and requires
an independently reserved manifest for another cycle. Correctness and safety
gates precede raw Pareto dimensions; unavailable cost is never zero.

Candidates remain local-sensitive untrusted data under owned project-local
staging. Review approval enables validation only. Promotion is a separate
preimage-checked confirmation and writes no global Pi state; rollback refuses
user divergence. Per-file writes are atomic and multi-file failures are
compensated, but host crashes between writes remain a hardening/recovery concern.
M8 adds no sandbox claim, live provider claim, automatic upload, executable Pi
Extension generation, package installation, credential discovery, commit, push,
or publication.

## M9 implementation review

M9 adds controls for `T-02`, `T-04`, `T-07`, `T-09`, `T-11`, `T-12`, `T-13`,
and `T-15`: Pi command strings are parsed into bounded argument arrays and never
passed to a shell; package and run roots must remain canonical project
descendants; report/candidate citations resolve to immutable inventories;
review diffs are hash-checked; text navigation rejects symlinks, size/hash drift,
unsupported media, and displays above 2 MiB; and package lifecycle tests run
offline with an environment allowlist that excludes provider credentials.

Race previews warn that trusted repository commands and Agent budgets may be
consumed and require confirmation. Reflection separately warns about a
configured redacted provider and confirms before the bridge. Approve enables
validation only. Promotion/rollback recompute exact plans, preview first, confirm
again, and refuse pre/postimage drift; unrelated state is asserted in tests.

Pi custom entries contain only schema-versioned command/status/run/artifact
pointers and do not participate in LLM context. Raw report, diagnosis, diff, and
candidate contents remain local-sensitive and are shown only on explicit user
navigation. Project trust controls loading but is not a sandbox: the extension,
repository commands, and Agents still have host user permissions. M9 performs no
automatic upload, auth discovery, provider call, package publication, global Pi
mutation, commit, or push.

## QA-06 implementation security review

The full threat-to-control/test/residual matrix is recorded in
[SECURITY_REVIEW.md](SECURITY_REVIEW.md). The review covered all `T-01..T-15`
and the required command-injection, traversal, symlink/hard-link, malicious
repository, secret, generated-Skill, package, cleanup, and recovery classes.

The review found and fixed `QA06-F01`, a high-impact final-component link
weakness in artifact append/recovery/ownership operations. Mutable and
ownership-bearing files are now opened with `O_NOFOLLOW` and accepted only when
they are regular files with one hard link. Artifact and cleanup regressions
prove external symbolic- and hard-link destinations remain unchanged. Cleanup
also revalidates run/cache ownership and every non-worktree target before the
first deletion.

Source and structural checks found no production `shell: true` and no workspace
install lifecycle scripts. Normal execution uses explicit executable/argument
arrays; the declared trusted-shell grader form remains intentionally executable
user input. Reports remain escaped, script-free, and default-deny CSP protected;
generated candidates remain declarative, project-local, validation-only until a
separate promotion confirmation, and package advice remains informational.

No unresolved critical or high security defect is known after the fix.
`QA-07` still owns unknown-secret/redaction completeness, and `QA-08` owns the
final dependency advisory, license, provenance, and package-content review.
PatchRace remains explicitly not a sandbox: trusted repository/Agent/Extension
execution has host-user authority, host-only verifier integrity stays
`unknown`, and same-user concurrent directory substitution is not claimed to be
atomically contained.

## QA-07 privacy and redaction review

The complete data-class, fixture, finding, workflow, retention, and residual
review is recorded in [QA_PRIVACY_REVIEW.md](QA_PRIVACY_REVIEW.md). Synthetic
malicious fixtures cover prompts, paths, five credential families, source code,
names, email addresses, IP addresses, unknown formats, and false-positive
controls across plain, JSON-encoded, and HTML-encoded text.

The review found and fixed five privacy defects. Encoded configured values are
now scanned, and the bounded stream transform emits nothing until complete
redaction. CLI export reloads the exact frozen config, accepts only the reviewed
default profile, reads only explicitly named runtime values, and fails closed
when a value is absent/short or configuration drifts. OTLP redacts sensitive
event fields before serialization and carries the unknown-secret warning.
No-follow bounded handles read export sources.

Most importantly, the complete local report is no longer accepted as a public
export source. Each run creates a separate `report/shareable/` projection that
removes source patches, changed/evidence/artifact paths, trajectory details,
executable/harness/workflow fields, environment names, and free-text trial
limitations before configured scanning. Report export accepts only this
projection. Diagnosis and candidate output have no shareable label and remain
local-sensitive.

No unresolved critical or high privacy defect is known after the fixes. This is
not a guarantee that an export contains no secrets. An intentionally unknown
fixture remains in output, and both manifest and OTLP evidence must say that
absence of unknown secrets is not guaranteed. Images, binaries, archives,
unreviewed encodings, transformed fragments, inferred information, and novel
formats remain outside scanner completeness. Preview paths are local-sensitive,
every public export requires human review, and publication remains a separate
user action. No telemetry, upload, provider call, credential discovery, or
automatic deletion was introduced.

## QA-08 dependency and release review

The pre-publication dependency, license, NOTICE, lockfile, package-content, and
provenance review is recorded in
[QA_RELEASE_AUDIT.md](QA_RELEASE_AUDIT.md). All 274 registry-backed lock entries
have integrity hashes. Seven production dependencies and 244 installed
development package/version pairs passed the license deny policy; the production
set is MIT, BSD-3-Clause, and ISC and requires no project NOTICE. npm reported no
known vulnerabilities, and all seven production version/integrity/license
records matched official registry metadata.

Nine local tarballs passed an explicit allowlist, required metadata/license/
README/entry/schema checks, workspace/catalog rewrite checks, zero install
lifecycle scripts, CLI bin/shebang validation, and scans for tests, fixtures,
raw artifacts, embedded source-map content, absolute source/home paths,
private-key markers, and credential-shaped literals. A clean isolated npm
consumer installed the local tarballs with scripts disabled and completed the
core CLI flow while preserving unrelated state.

Every package requests public npm provenance, Changesets binds all nine versions,
and CI/supply-chain Actions use full commit SHAs and least privilege. These are
configuration controls, not signed attestation evidence. The repository has no
commit/remote or protected publish workflow, packages remain at `0.0.0`, and
nothing was published. Namespace ownership, release version/tag, protected OIDC
publication, actual registry provenance, post-publish installation, and GitHub
release signatures remain mandatory `QA-09`/M11 gates. Registry advisories and
ownership are point-in-time state and must be rechecked immediately before
release.
