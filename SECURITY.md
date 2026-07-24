# Security Policy

## Supported version

`v0.1.0-rc.2` is the only currently supported preview. It is source-only and
pre-stable; security fixes may require upgrading to a newer preview rather than
backporting.

## Report privately

Do not open a public issue for a suspected vulnerability, credential exposure,
private-source disclosure, unsafe cleanup, or an exploit that has not been
fixed.

Use this repository's GitHub private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Advisories**.
3. Select **Report a vulnerability**.

If that control is unavailable, open a public issue containing only the phrase
“private security contact needed” and no technical or sensitive detail. A
maintainer will establish a private channel.

Include only what is necessary:

- affected PatchRace version and supported environment;
- impact and the smallest safe reproduction;
- whether credentials, private code, unrelated files, or global Pi state may
  have been affected;
- suggested mitigation, if known.

Do not attach real credentials, private repositories, raw Agent traces,
unreviewed run directories, or full local reports. Use inert synthetic fixtures
and redact personal paths.

## Response

The lead maintainer will acknowledge a private report as soon as practical,
normally within three business days, then confirm scope, severity, remediation,
and coordinated disclosure timing. Critical data-loss, credential-leak,
unsafe-cleanup, grading-integrity, holdout-leakage, or silent generated-artifact
activation findings stop release until fixed and reverified.

## Security boundary

PatchRace is local-first but not a sandbox. Git worktrees isolate repository
state only. Repository setup/verifier commands and Agent CLIs execute with the
invoking user's filesystem, process, credential, and network authority.
Redaction reduces known disclosure patterns but cannot prove removal of every
unknown or transformed secret.

See [the threat model](docs/THREAT_MODEL.md) and
[security, privacy, and cleanup guide](docs/SECURITY_PRIVACY_AND_CLEANUP.md).
