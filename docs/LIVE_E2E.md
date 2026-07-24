# Live-provider end-to-end check

Last verified: 2026-07-23

PatchRace `v0.1.0-rc.2` was exercised with a real Pi CLI and a real DeepSeek
model call. This check exists to cover the boundary that deterministic fixtures
cannot: provider authentication, structured Pi output, live adapter parsing,
budget accounting, grading, reporting, diagnosis, and cleanup in one flow.

## Configuration

| Item | Value |
|---|---|
| Pi CLI | `0.81.1` |
| Provider/model | DeepSeek / `deepseek-v4-flash` |
| Trials and concurrency | 1 / 1 |
| Token ceiling | 4,096 |
| Cost ceiling | US$0.05 |
| Trial/wall ceilings | 90 s / 120 s |
| Disk ceiling | 64 MiB |
| Task | Replace one line in one tracked text file |

The credential was injected only into the child process environment. It was
not placed in PatchRace configuration, command arguments, the test repository,
or committed evidence.

## Result

- the executable/version/capability checks passed;
- the task trial completed and passed setup, verifier, and assertion gates;
- Pi reported 1,740 tokens and an observed cost of US$0.0000189392;
- the trial took about 3.30 seconds and changed exactly one file;
- JSON, standalone HTML, JUnit, and SARIF reports were generated;
- the primary repository and unrelated state remained unchanged;
- cleanup dry-run selected only the recorded run root, and confirmed cleanup
  removed that root while preserving the primary worktree;
- an exact-value scan found zero occurrences of the injected credential in the
  retained run/report artifacts.

The successful-trial diagnosis regression discovered during this exercise is
fixed in `v0.1.0-rc.2`: a valid passing trial whose hard gates all pass has no
failure finding and records `trial_passed_no_failure_to_diagnose`.

## Limits

This was one deliberately tiny paid run, not a model-quality benchmark or a
pricing guarantee. Exact-value scanning cannot prove removal of unknown,
encoded, transformed, or model-reproduced secrets. Agent and repository
processes still execute with the invoking user's host authority.
