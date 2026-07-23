# Private Beta Protocol

Status: ready for independent participants  
Last updated: 2026-07-23  
Task: `BETA-02`

## Purpose and non-negotiable sample

The private beta measures whether target users can activate and understand
PatchRace without its implementer guiding each step. It requires at least five
people who did not author the implementation. Maintainers, coding agents,
synthetic personas, replayed sessions, and duplicate attempts by one person do
not count as independent participants.

Target participants are developers who:

- evaluate or compare coding Agents;
- maintain a repository with meaningful tests;
- customize Pi or are willing to inspect a project-local workflow candidate;
- can use a terminal and Git on a supported macOS/Linux environment.

Participation is voluntary. Use a pseudonymous ID and obtain explicit consent
before timing begins. Do not record a real name, email, employer, repository
URL/path, source code, prompts, credentials, raw Agent trace, screen recording,
or verbatim sensitive quote in the beta record.

## Recruitment and independence

Recruit at least five distinct people outside the implementation authorship
group. The maintainer may answer scheduling/consent questions before the
session, but an activation counts as “without live maintainer intervention”
only when the participant follows the checked guide and resolves ordinary
problems from product diagnostics/documentation without real-time procedural
help.

Record `implementationAuthor: false` and a pseudonymous stable participant ID.
Do not infer independence: ask the participant whether they authored any
PatchRace implementation code. A participant who contributed code may provide
feedback but must be excluded from the five-person gate.

Do not collect private artifacts through an unapproved service. The source-only
preview may be public; provide a reviewed tagged source copy and exact commit
appropriate to the participant. Package publication remains out of scope.

## Session preparation

The participant needs:

- a supported macOS/Linux machine;
- Node `>=22.22.0 <25`, Git, and Corepack;
- a private source copy of this candidate;
- Python 3 and POSIX `/bin/sh`/`awk` only for the corresponding examples;
- optionally, their own trusted small repository and existing local Agent CLI
  authentication.

No provider credential is needed for the prepared example. Any live Agent run
is optional and must use the participant's own informed choice, account, data
policy, and budget. The facilitator must not request or observe a credential.

Before the first session:

```bash
corepack pnpm beta:prepare
corepack pnpm beta:protocol:verify
corepack pnpm beta:verify:selftest
```

This creates an ignored local collection directory and verifies the protocol.
The self-test exercises five temporary positive records plus fewer-than-five,
sample, implementation-author, duplicate-ID, and sensitive-contact-data
negative cases. Its dedicated temporary roots are removed and can never produce
`COLLECTED` status or modify the real participant collection. It does not create
a fake participant.

## Participant flow

Give the participant only
[the participant guide](PRIVATE_BETA_PARTICIPANT_GUIDE.md) and the source copy.
Do not demonstrate the commands first.

1. Start the timer when the participant begins prerequisite/source
   installation.
2. Observe silently. Record product-visible failures and whether the
   participant used docs, product remediation, or live maintainer help.
3. Stop activation time when the prepared example has a valid two-trial report
   the participant can open.
4. Ask the participant to explain, in their own words:
   - which hard gates passed/failed;
   - what comparison axis the example represents;
   - why the report does not prove a universally better Agent;
   - whether the retained report is safe to publish.
5. Ask them to review the deterministic teaching/holdout result and explain why
   the candidate was proposed, what validation/holdout mean, and whether
   `promote-eligible` activates configuration.
6. Ask them to attempt PatchRace on their own trusted repository or one
   realistic non-prepared example. A deterministic example is acceptable for
   safety, but the prepared quickstart itself does not satisfy this measure.
7. Record each failure and recovery. Do not fix the product during the session.
8. Ask the qualitative questions and whether they will return for a second
   meaningful run or can name a concrete intended next use.
9. End the timer, confirm retention consent, and store only the minimized
   pseudonymous record.

If the participant voluntarily performs a live Agent run, record only the
normalized adapter/model/version category, declared budget, outcome, and
limitations. Do not copy raw vendor output or auth state into the beta record.

## Required qualitative questions

Ask in neutral language:

1. What problem, if any, would you use PatchRace to solve?
2. What was the first confusing or risky moment?
3. Which result did you trust, and what evidence made it trustworthy?
4. What did you expect the product to do that it did not do?
5. Was the distinction between model, harness, and workflow clear?
6. Was it clear that worktrees are not a sandbox and reports are
   local-sensitive?
7. Would you perform a second meaningful run? If yes, on what task; if no, why?
8. What single change would most improve activation or repeat use?

Paraphrase responses and let the participant review any public-safe summary.
Raw notes stay private and are not committed.

## Metrics and gates

The five-user minimum is a sample requirement, not permission to stop
collecting failures. The release-facing gates are:

| Measure | Gate |
|---|---:|
| Valid prepared-example report without live maintainer intervention | ≥ 4/5 |
| Valid report on own or realistic non-prepared repository | ≥ 3/5 |
| Correct explanation of report pass/fail and claim boundary | ≥ 4/5 |
| Understand diagnosis/candidate proposal and activation boundary | ≥ 3/5 |
| Second run completed or concrete repeat-use intent | ≥ 3/5 |
| Critical usability blockers left open | 0 before release |

Activation time records install start to first valid report. Also record install
time and prepared-run time separately when available. Do not discard slow or
failed attempts. Median and p90 are descriptive at five users; report exact
values and avoid population claims.

## Failure and issue classification

Every observed failure is one of:

- `product-bug`;
- `documentation-or-usability`;
- `environment-or-adapter`;
- `invalid-task`;
- `agent-failure`;
- `expected-budget-stop`;
- `participant-choice`;
- `unknown`.

Assign impact:

- `P0`: data loss, secret/publication exposure, invalid grading/holdout,
  destructive cleanup, or unusable product for the target population;
- `P1`: blocks activation/core workflow for a meaningful subset with no clear
  safe workaround;
- `P2`: material friction or confusion with a workaround;
- `P3`: minor polish.

Do not close an issue because aggregate metrics pass. `BETA-03` must fix, defer
with explicit rationale, or delay launch for every P0/P1.

## Data handling

Participant records live under `.artifacts/private-beta/participants/` and are
Git-ignored. Each JSON record follows
[`beta/participant-record.schema.json`](../beta/participant-record.schema.json).
Store only pseudonymous IDs, categorical environment information, timestamps/
durations, booleans, classified failures, paraphrased feedback, and
content hashes/logical evidence labels.

Do not include:

- names, contact details, employer/team, account IDs, IP addresses;
- absolute paths, repository remotes, private code, patches, commands with
  private values, prompts, raw traces, screenshots, or report files;
- credentials, auth readiness details, API endpoints, spend/account data;
- hidden verifier/reference/holdout IDs or contents.

The local collection is not a public export. Share only an aggregate,
manually reviewed summary after the private reporting/publication boundary is
configured.

## Completion

Run:

```bash
corepack pnpm beta:verify
```

The verifier rejects samples, duplicates, implementation authors, missing
consent, invalid/unsafe fields, fewer than five participants, unclassified
failures, and unsupported claims. It calculates exact counts, activation median
and nearest-rank p90, gate outcomes, repeat-use intent, and open P0/P1 issue IDs.

`BETA-02` is complete only after five real independent records exist and the
summary has been reviewed. Tooling readiness alone is not participant evidence.
