# M10 Release-Candidate Review

Version: `v0.1.0-rc.1`  
Status: passed for source-only GitHub preview  
Reviewed: 2026-07-23

## Decision

`QA-09` reviews a source-only GitHub preview. `ADR-022` drops the blocked
pre-publication `BETA-02`/`BETA-03` path at the owner's direction while
retaining the factual result: zero of five independent target users have
tested PatchRace. The preview is therefore neither stable nor beta-validated.

No other release gate is waived. A correctness, data-loss, cleanup,
credential-leak, privacy, security, invalid-grading, holdout-leakage, silent
candidate-activation, documentation, or package-content failure still blocks
publication.

## Candidate identity

- Nine public packages: `0.1.0-rc.1`, fixed together by Changesets.
- CLI `patchrace --version`: must return `0.1.0-rc.1`.
- Durable run controller provenance: must record the same package version.
- Distribution for this preview: tagged GitHub source only.
- npm publication: no.
- Provider/credentialed release test: no.

## Required evidence

| Gate | Evidence | Result |
|---|---|---|
| Product and correctness | Full `pnpm check`, deterministic fixtures, compiled CLI smoke | Passed: 75 files/245 tests |
| Version identity | Manifest/CLI/provenance regression and nine aligned packages | Passed: `0.1.0-rc.1` |
| Dogfood | 55 started, 50 passing, 5 classified Agent failures, 10 tasks, three adapters | Passed in `BETA-01` |
| Platform | macOS/Ubuntu arm64/x64, Node 22/24 clean-source matrix | Passed locally; first hosted run pending publication |
| Chaos and cleanup | interruption/recovery/ownership/link/disk/budget matrix | Passed |
| Performance | orchestration/report/memory/disk/concurrency budgets | Passed |
| Security and privacy | implementation reviews, malicious fixtures, bounded shareable export | Passed with documented residuals |
| Documentation | installation, methodology, safety, contributor guides, three ecosystems, public links | Passed; 110 Markdown files, zero broken local links |
| Package contents | nine local tarballs, licenses, integrity, source maps, no lifecycle scripts | Passed for versioned local tarballs |
| Independent users | 0/5 | Waived for preview only by `ADR-022`; not passed |

## Publication conditions

Before the tag is made public:

1. `pnpm check` and `pnpm qa:rc` pass from the final source state.
2. The source tree is inspected for ignored artifacts, credentials, private
   traces, personal paths, generated output, and unrelated files.
3. README, installation, changelog, release notes, security policy, behavior
   policy, and issue templates match the preview boundary.
4. The GitHub repository enables private vulnerability reporting and read-only
   CI permissions.
5. The public release is marked prerelease and states 0/5 independent users,
   source-only installation, no npm publication, and the non-sandbox boundary.
6. The hosted CI matrix is observed after push; a failure blocks presenting
   the preview as verified even if the source remains visible.

## Residual risks

- Independent usability, activation, comprehension, and repeat use are unknown.
- Live Agent quality and provider cost are not established by deterministic
  fixtures.
- Vendor CLI compatibility can drift after the point-in-time matrix.
- Worktrees do not constrain host authority.
- Redaction cannot guarantee removal of unknown or transformed secrets.
- The first GitHub-hosted macOS/Linux CI evidence does not exist until the
  repository is pushed.

## Verification result

The final local candidate passed:

```text
pnpm check
pnpm qa:rc
pnpm docs:quickstart:verify
pnpm docs:methodology:verify
pnpm docs:security:verify
pnpm docs:contributors:verify
pnpm examples:verify
pnpm beta:dogfood:verify
```

`pnpm check` passed formatting, ESLint, strict TypeScript, 75 test files/245
tests, fixtures, build/schema generation, and the compiled CLI journey. The
fresh source-copy verifier installed the locked graph in 684 ms and reached a
valid two-trial report in 5.705 seconds (6.548 seconds total). `pnpm qa:rc`
aligned and dry-packed all nine `0.1.0-rc.1` packages, checked 274 integrity
entries, seven production and 244 development-package licenses, and retained
`published: false`.

The M10 decision is PASS under `ADR-022`'s bounded preview waiver. Hosted CI,
repository settings, tag/release creation, and public URL verification belong
to the GitHub publication task and can still stop or retract the preview
claim.
