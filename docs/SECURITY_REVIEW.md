# QA-06 Implementation Security Review

Status: passed with no unresolved critical or high findings  
Reviewed: 2026-07-23  
Scope: PatchRace v0.1 implementation through `QA-05`

## Release decision

The implementation has concrete controls or an explicit, user-visible residual
for every principal threat in [THREAT_MODEL.md](THREAT_MODEL.md). The review
found one high-impact local filesystem issue, `QA06-F01`: append and recovery
operations could follow a same-user attacker-created symbolic link at the final
file component. The fix opens mutable and ownership-bearing files with
`O_NOFOLLOW`, requires a regular file with exactly one hard link, and adds
regressions proving that external sentinel files are unchanged.

No unresolved critical or high security defect is known after that fix.
`QA-07` remains the independent privacy/redaction gate, and `QA-08` remains the
final dependency, license, and release-package gate. Passing this review does
not authorize provider calls, publication, installation, or promotion.

## Method

The review combined:

- source inspection of process spawning, path resolution, artifact persistence,
  recovery, cleanup, report rendering, candidate generation, task integrity,
  adapter probing, and package manifests;
- malicious fixtures for shell-shaped arguments, traversal, symbolic and hard
  links, ownership swaps, corrupted evidence, HTML injection, hidden-verifier
  leakage, generated instructions, and unrelated-state preservation;
- a structural verifier that rejects production `shell: true`, install
  lifecycle scripts, missing no-follow controls, incomplete threat coverage,
  and weakened report/candidate boundaries;
- the focused `pnpm qa:security` suite plus the repository completion gates.

Repository setup, tests, graders, Agents, Pi extensions, and generated
instructions are executable or action-driving untrusted inputs. PatchRace
requires explicit authority and evidence controls, but v0.1 does not sandbox
them from the host user account.

## Finding disposition

| ID | Severity | Finding | Disposition and evidence |
|---|---|---|---|
| `QA06-F01` | High | Append, recovery, and ownership-file reads could follow a pre-created final-component symbolic link; hard-linked files could also redirect a write outside the owned run. | Fixed. `openRegularFileNoFollow` uses `O_NOFOLLOW`, requires a regular file and `nlink === 1`, and is used by artifact append/verification, recovery read/truncate/append, run ownership reads, and cleanup ownership reads. `artifacts.test.ts` and `cleanup.test.ts` preserve external sentinels for symbolic- and hard-link cases. |

## Threat-to-evidence matrix

| Threat | Implemented control | Primary regression evidence | Residual |
|---|---|---|---|
| `T-01` Prompt injection and unrelated access | Exact worktree roots, adapter working-directory/sandbox flags where officially supported, observable action capture, external verifier separation, and explicit host-risk warning. | `packages/adapters/src/adapters.test.ts`; `packages/tasks/src/integrity.test.ts`; `packages/core/src/worktrees.test.ts` | An Agent with host-user authority can still read or change host-accessible data. Only a real isolation backend could reduce this further. |
| `T-02` Malicious repository commands | Race refuses execution unless `trustRepositoryCommands: true`; task commands are explicit typed inputs; Pi shows repository/Agent risk before confirmation. | `packages/cli/src/comparison-service.test.ts`; `packages/pi-extension/src/workflow.test.ts` | Trusted setup/test/grader code runs with host permissions. Worktrees are not a sandbox. |
| `T-03` Command injection | The shared process runner and Pi bridge use executable/argument arrays with `shell: false`; the only shell form is an explicit trusted grader contract, not interpolated user text. | `packages/core/src/process.test.ts`; `packages/pi-extension/src/bridge.test.ts`; `packages/tasks/src/grader.test.ts` | A user-authorized trusted-shell grader can execute arbitrary shell code by design and must be reviewed as executable repository input. |
| `T-04` Traversal, symbolic links, and ownership escape | Logical paths reject absolute, empty, and parent components; canonical descendants and real directories are required; mutable/ownership files use no-follow single-link opens; cleanup revalidates exact ownership immediately before deletion. | `packages/core/src/artifacts.test.ts`; `packages/core/src/cleanup.test.ts`; `packages/core/src/chaos.test.ts`; `packages/tasks/src/assertions.test.ts`; `packages/optimizer/src/staging.test.ts`; `packages/optimizer/src/promotion.test.ts` | Same-user hostile replacement of an already-validated directory component cannot be made an isolation guarantee without directory handles or a sandbox; failures retain evidence where detected. |
| `T-05` Unrelated process or Git-state destruction | Spawned process groups and worktrees have recorded provenance; timeout/cancellation signal only the owned group; cleanup is preview-first, exact-target, ownership-checked, and fail-closed. | `packages/core/src/process.test.ts`; `packages/core/src/worktrees.test.ts`; `packages/core/src/cleanup.test.ts`; `packages/core/src/chaos.test.ts` | PID reuse, privileged hostile processes, and abrupt host power loss remain operating-system residuals. |
| `T-06` Grader or hidden-test modification | Hidden verifier material lives outside the Agent tree and is injected create-new after Agent exit; protected paths, immutable hashes, prompt/patch leakage, and configuration drift are hard gates. | `packages/tasks/src/hidden-verifier.test.ts`; `packages/tasks/src/integrity.test.ts`; `packages/tasks/src/task.test.ts` | Host-only verifier secrecy is reported `unknown`, never `valid`, because same-user processes can search outside their cwd. |
| `T-07` Secret/private evidence disclosure | Raw evidence stays local-sensitive; logging redacts configured values; auth probes record status only; export is selected, previewed, create-new, drift-checked, and explicitly confirmed. | `packages/core/src/logging.test.ts`; `packages/core/src/doctor.test.ts`; `packages/core/src/report-export.test.ts`; `packages/adapters/src/adapters.test.ts` | Unknown secret formats and private code can remain in raw artifacts or a redacted export. `QA-07` performs the dedicated privacy review. |
| `T-08` Active report content | All HTML renderers escape untrusted content, use no scripts or remote resources, and set a default-deny CSP; JSON, JUnit, and SARIF formats encode untrusted fields. | `packages/report/src/index.test.ts`; `packages/report/src/diagnosis.test.ts`; `packages/report/src/candidate-review.test.ts`; `packages/report/src/formats.test.ts` | Opening reports in a vulnerable external viewer is outside PatchRace's containment promise. |
| `T-09` Authentication extraction | Adapters use official readiness/version surfaces, constructed environment allowlists, non-secret normalized states, and never enumerate credential stores. | `packages/adapters/src/adapters.test.ts`; `packages/core/src/doctor.test.ts`; `packages/pi-extension/src/compatibility.test.ts` | Vendor CLIs may independently read their normal local auth stores and send data according to their account behavior. |
| `T-10` Resource and cost exhaustion | Preflight and runtime trial/wall/token/cost/disk/concurrency limits are hard; cancellations are bounded; paid retries require explicit attempts and lineage; unavailable cost is not zero. | `packages/core/src/budgets.test.ts`; `packages/core/src/scheduler.test.ts`; `packages/core/src/process.test.ts` | A vendor may report delayed or unavailable subscription cost. Exact provider spend remains subject to user-declared budgets. |
| `T-11` Package/supply-chain compromise | Exact dependency versions and a frozen lockfile are used; package manifests contain no install lifecycle scripts; Pi lifecycle tests are offline; dry-pack and production-license gates inspect shipped content. | `scripts/release-dry-run.mjs`; `scripts/check-licenses.mjs`; `scripts/verify-pi-package.mjs`; structural `scripts/verify-security-review.mjs` | Registry, provenance, and final advisory state are rechecked by `QA-08`; no audit can prove upstream packages uncompromised. |
| `T-12` Unsafe or overfit generated Pi behavior | Generators reject secrets, executable extensions, package/auth commands, automatic actions, broad Skills, hidden/reference material, and undeclared changes; validation/holdout and explicit promotion/rollback remain separate. | `packages/optimizer/src/generation.test.ts`; `packages/optimizer/src/recommendations.test.ts`; `packages/optimizer/src/review.test.ts`; `packages/optimizer/src/promotion.test.ts` | Declarative instructions remain untrusted and may degrade behavior; fixture improvement is not a generalization claim. |
| `T-13` Malformed or oversized imported evidence | Schemas, bounded parser records, output limits, event presentation caps, hash verification, inert rendering, and inspectable malformed raw bytes fail closed. | `packages/adapters/src/adapters.test.ts`; `packages/core/src/recovery.test.ts`; `packages/pi-extension/src/status.test.ts`; `packages/report/src/index.test.ts` | Raw evidence can consume configured disk up to its hard budget; real device exhaustion is an operational residual. |
| `T-14` Reference/holdout leakage | Content-addressed splits, phase authorization, external verifier assets, prompt/path/content scans, one-time final holdout opening, and no-retune records separate proposal from evaluation. | `packages/tasks/src/split.test.ts`; `packages/tasks/src/integrity.test.ts`; `packages/tasks/src/hidden-verifier.test.ts`; `packages/optimizer/src/promotion.test.ts` | Transformed leakage can evade exact scanners on a host-only backend, so enforced-isolation claims remain unavailable. |
| `T-15` Misleading version or comparison claims | Exact executable identity/version/configuration provenance is retained; unsupported versions fail closed; missing capabilities and metrics are unavailable; model, harness, and workflow dimensions stay separate. | `packages/adapters/src/adapters.test.ts`; `scripts/verify-agent-cli-compatibility.mjs`; `packages/report/src/index.test.ts` | Vendor releases can drift after review; compatibility checks must be rerun before release and after range changes. |

## Requested attack-class verdicts

| Attack class | Verdict |
|---|---|
| Command injection | Mitigated by no-shell argv execution; explicit trusted-shell graders remain user-authorized executable input. |
| Path traversal and symlink/hard-link escape | Mitigated by owned/canonical paths, real-directory checks, no-follow single-link file handles, hashes, and exact ownership. Same-user directory-swap races remain a documented non-sandbox residual. |
| Malicious repository | Explicitly not contained; execution requires trust and warns about host authority. This is an accepted v0.1 product boundary, not a hidden defect. |
| Secrets and auth | No credential discovery or persistence; redaction/export controls exist. Unknown patterns remain for `QA-07`. |
| Generated Skill/instructions | Restricted to narrow declarative candidates, never automatically installed or activated, and gated by review, validation, promotion, and rollback. |
| Package/supply chain | Exact locked inputs, no install hooks, offline lifecycle, dry-pack and license checks; final advisory/provenance review is `QA-08`. |
| Cleanup and recovery | Preview/confirm, immutable ownership, execution-time revalidation, process/worktree provenance, partial-evidence retention, and unrelated-state assertions. |

## Residual-risk decision

The following residuals are accepted for this gate and remain visible release
constraints:

1. PatchRace is not a filesystem, process, credential, or network sandbox.
2. User-approved repository, grader, Agent, and Pi extension code runs with the
   user's operating-system authority.
3. A malicious same-user process can race host filesystem operations or inspect
   host-visible verifier material; PatchRace fails closed where it can observe
   the change but does not claim enforced isolation.
4. Secret scanning cannot guarantee removal of unknown or transformed secrets.
5. Dependency advisories, vendor behavior, and supported CLI versions can
   change after review and require the later release gates.

None of these residuals is represented as solved, and none permits automatic
publication, package installation, provider use, credential access, or global
Pi mutation.
