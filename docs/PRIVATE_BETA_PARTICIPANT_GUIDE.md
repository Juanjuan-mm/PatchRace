# PatchRace Private Beta Participant Guide

Last updated: 2026-07-23

Thank you for testing a source-only preview of a local-first coding-Agent
comparison tool. This session evaluates the product and its documentation, not
you. You may stop at any time. Do not share credentials or private source with
the facilitator.

PatchRace runs trusted repository commands and Agent tools with your user
account authority. It is **not a sandbox**. Use only this reviewed prepared
example or a repository whose commands you trust.

## 1. Install and produce the prepared report

Follow [Installation and five-minute quickstart](INSTALLATION.md) from the
beginning. Do not ask the facilitator for command-by-command help unless you
would otherwise stop; if you do ask, that is useful product evidence.

When the command finishes, open the retained local `report.json` or
`index.html`. Do not publish it.

## 2. Explain the result

Without looking for a preferred answer, explain:

- what the two variants did;
- which deterministic gates passed or failed;
- what the ranking means;
- what the result does **not** prove;
- whether the complete local report is safe to share.

Use [Concepts and methodology](CONCEPTS_AND_METHODOLOGY.md) if needed.

## 3. Inspect teaching and holdout

Run:

```bash
corepack pnpm m8:demo
```

Read the JSON result and explain:

- why the project-guidance candidate was proposed;
- what changed;
- how validation differs from final holdout;
- whether `promote-eligible` already changed Pi configuration;
- whether the final holdout can be reused for retuning.

## 4. Attempt a realistic second repository

Choose either:

- one of the non-prepared examples in
  [Realistic deterministic examples](REALISTIC_EXAMPLES.md); or
- your own small trusted repository with meaningful tests.

For your own repository, review every setup/test/grader command and keep
provider use within your own data policy and budget. The beta does not require a
live Agent or credential. Do not send the facilitator your raw report, code,
path, prompt, or credential.

Try to produce a valid report and clean only PatchRace-owned state using a
preview first. Use [Security, privacy, and cleanup](SECURITY_PRIVACY_AND_CLEANUP.md)
when uncertain.

## 5. Give feedback

The facilitator will ask what was useful, confusing, missing, or risky and
whether you would perform a second meaningful run. They should store only a
pseudonymous, paraphrased, minimized record. Ask to review any summary that
might later be quoted.

The product has no automatic telemetry or upload. Reports and raw runs stay
local until you explicitly clean them.
