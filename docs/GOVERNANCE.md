# Governance

Last updated: 2026-07-23

PatchRace uses the Apache License 2.0 and a lead-maintainer governance model.
The repository owner is the initial Lead Maintainer and has final responsibility
for releases, security response, moderation, roadmap decisions, and merges.

## Contributions

Contributions use the Developer Certificate of Origin 1.1. Each contributed
commit must include a `Signed-off-by` line. Contributors retain copyright in
their work and license it under Apache-2.0.

Substantial coding-agent assistance should be disclosed in the pull request
along with the human review and verification performed. Generated work is held
to the same correctness, security, privacy, licensing, and provenance standards
as other contributions.

## Decisions and review

| Change | Review expectation |
|---|---|
| Bug fix or internal refactor | Pull request, focused tests, ordinary review |
| Public schema or adapter contract | Compatibility and migration plan |
| Security, privacy, auth, cleanup, or destructive behavior | Threat-model update, regression tests, heightened review |
| Release | Changelog, clean package audit, verification, maintainer approval |
| Governance or license | Public proposal and explicit maintainer decision |

Maintainers seek contributor consensus. The Lead Maintainer resolves deadlocks.
When multiple maintainers are available, sensitive changes should receive an
independent approval and release permissions should follow least privilege.

Maintainer appointment is based on sustained technical contributions, careful
review, responsible handling of user data and destructive actions, respectful
community participation, and willingness to perform maintenance and incident
work.

## Conduct and security

Community participation follows [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
Private vulnerability reporting follows [SECURITY.md](../SECURITY.md).
Credentials, private source, raw traces, and unpatched exploit details must not
be posted in public issues.
