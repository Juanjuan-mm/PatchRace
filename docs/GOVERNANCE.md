# License and Governance

Accepted: 2026-07-22

## License

PatchRace will be released under the **Apache License 2.0** (`Apache-2.0`). The Apache Software Foundation identifies Apache License 2.0 as its current license, and the license includes explicit copyright and patent grants from contributors. See the [Apache license index](https://apache.org/licenses/) and [Apache License 2.0 text](https://httpd.apache.org/docs/2.4/en/license.html).

Rationale:

- permissive use for individuals, companies, integrations, and downstream tooling;
- explicit contributor patent grant and termination terms;
- compatible with the intended open ecosystem and optional commercial services later;
- already familiar in adjacent agent-optimization projects.

The canonical `LICENSE` file will be added from the unmodified official text when source scaffolding starts. The planned copyright notice is:

```text
Copyright 2026 PatchRace contributors
```

A `NOTICE` file will be created only when required by bundled or modified dependencies or when project notices need preservation. `QA-08` must audit the final dependency/license set before release.

This document records a project choice, not legal advice.

## Contribution terms

PatchRace will use the **Developer Certificate of Origin 1.1** rather than a bespoke Contributor License Agreement for v0.1. Contributors certify their right to submit a change through a `Signed-off-by` line. The canonical terms are maintained at [developercertificate.org](https://developercertificate.org/).

Rules:

- Every commit contributed through a pull request must carry `Signed-off-by`.
- Contributors retain copyright in their contributions and license them under Apache-2.0.
- No separate copyright assignment is required.
- A future CLA requires a new accepted governance decision and must not retroactively rewrite contribution terms.
- Contributors remain accountable for the origin, license compatibility, correctness, and safety of agent-assisted changes.

Substantial coding-agent assistance should be disclosed in the pull request description together with the verification performed. Disclosure is for reviewability, not a bar to contribution.

## Initial governance model

The project starts with a **lead-maintainer model** suitable for a single-owner repository:

- The repository owner is the initial Lead Maintainer.
- The Lead Maintainer owns release, security, roadmap, moderation, and final merge decisions.
- Decisions should seek contributor consensus and record material product/architecture choices, but the Lead Maintainer resolves deadlocks.
- No contributor obtains merge, npm, or release rights solely through activity volume.

When more maintainers exist:

- ordinary changes require one maintainer approval;
- security-sensitive, release, authentication, cleanup, and artifact-format changes require two maintainer approvals when two independent maintainers are available;
- a maintainer may not be the sole approver of their own security-sensitive change when another maintainer is available;
- package publication and GitHub release permissions follow least privilege.

## Becoming or leaving as a maintainer

Maintainer appointment is based on sustained evidence rather than a fixed contribution count:

- sound reviews and reliable technical contributions over time;
- demonstrated care with user data, destructive actions, compatibility, and evidence quality;
- respectful community participation;
- willingness to perform issue triage, release, and incident work;
- explicit acceptance of the project's governance and security responsibilities.

The Lead Maintainer appoints initial additional maintainers. Once three or more maintainers exist, appointments and removals require a documented majority decision. Inactive maintainers may move to emeritus status after direct notice and a reasonable response window.

## Decision process

| Change type | Required process |
|---|---|
| Bug fix or internal refactor inside accepted contracts | Pull request, tests, ordinary review. |
| New v0.1 feature or scope change | Task update plus accepted ADR identifying what it replaces or why scope changes. |
| Public schema or plugin/adapter contract | ADR, compatibility plan, review, and migration policy. |
| Security/privacy/destructive behavior | Threat-model update, dedicated tests, and heightened review. |
| Release | Release checklist, clean package audit, changelog, and maintainer approval. |
| Governance/license change | Public proposal, explicit accepted decision, and migration/legal review as appropriate. |

## Code of Conduct policy

The public project will adopt **Contributor Covenant 2.1** for repository issues, pull requests, discussions, and official community spaces. The canonical text and enforcement structure are available from the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

Before public launch, `LCH-04` must add the unmodified/adapted in-repo policy with:

- a real private reporting contact controlled by the maintainer;
- an enforcement owner and backup when available;
- scope covering official project spaces;
- privacy expectations for reporters;
- the standard attribution.

The contact is intentionally not invented during M0. Public launch is blocked until it is filled.

## Security governance

- Vulnerabilities must be reported privately through GitHub private vulnerability reporting or a published security contact once configured.
- Public issues must not request or contain credentials, private traces, or exploit details for unpatched critical vulnerabilities.
- Maintainers may embargo details long enough to prepare a fix and coordinated release.
- Release credentials, npm tokens, and signing keys must never be shared through repository files or agent traces.
- Maintainers may reject generated contributions whose provenance or verification is inadequate even when tests pass.

## Governance review trigger

Revisit this model when any of the following occurs:

- the second maintainer is appointed;
- a legal entity or fiscal sponsor owns release assets;
- hosted/commercial services launch;
- a major corporate contributor requests different contribution terms;
- the project experiences a security incident or governance deadlock;
- the project reaches the first stable `1.0` planning cycle.
