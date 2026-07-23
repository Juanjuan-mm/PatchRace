# M1 Feasibility Spike Evidence

Status: accepted evidence for `SPIKE-01..06`  
Last updated: 2026-07-22

## Environment and method

- macOS arm64, Git `2.50.1 (Apple Git-155)`, Node `22.22.1`, npm `10.9.4`.
- All mutable fixtures and worktrees were created under unique `/private/tmp/patchrace-*` roots.
- No credential file contents or token values were inspected. Official CLI status/minimal invocation established auth readiness.
- Local loopback stubs exercised Pi/Claude protocols without cost or real credentials. Codex additionally completed a live authenticated fixture through the user's installed official binary.
- Worktrees are treated as repository isolation only, not a security sandbox.

Scripts are in [`spikes/`](../../spikes/README.md). A PASS is based on script assertions and the checks below, not on prose alone.

## SPIKE-01 — Pi headless and SDK

Official Pi documentation now installs `@earendil-works/pi-coding-agent`; the earlier `@mariozechner/pi-coding-agent` package is deprecated. The current package was installed only under `/private/tmp/patchrace-m1-pi` with lifecycle scripts disabled. Sources: [Pi documentation](https://pi.dev/docs/latest), [JSON mode](https://pi.dev/docs/latest/json), [RPC mode](https://pi.dev/docs/latest/rpc), [SDK](https://pi.dev/docs/latest/sdk).

Command:

```bash
npm install --prefix /private/tmp/patchrace-m1-pi --ignore-scripts @earendil-works/pi-coding-agent
node spikes/pi-spike.mjs
```

Observed PASS:

- Pi version `0.81.1`.
- An isolated `PI_CODING_AGENT_DIR`, session directory, disabled project/global resources, offline startup, and disabled telemetry were used.
- JSON CLI exited `0` with 13 records covering `session`, agent/turn/message start/update/end, and settled events.
- One isolated session JSONL file was persisted with session/model/thinking/message records.
- `createAgentSession` via the package SDK exited normally with 12 events and two messages.
- A slow loopback request was cancelled by signaling only the detached Pi process group; it exited `143`, and the parent/stub remained alive to report the result.
- The machine had no Pi auth file. The fixture used a literal dummy key accepted only by its loopback server. Real missing auth is therefore an expected preflight state, not falsely reported ready.

Conclusion: CLI JSON, subprocess isolation, session capture, SDK embedding, event subscriptions, and cancellation are feasible. RPC remains a documented supported alternate path; SDK is preferred for same-process Pi integration, JSON CLI for parity/containment and raw session evidence.

## SPIKE-02 — Claude Code headless

The installed Claude Code is `2.1.104`. Its help and [official CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage) expose print mode plus `json`/`stream-json`, explicit tools/permissions, session controls, model selection, and budget output.

Real auth probe/minimal invocation:

```bash
claude -p '<fixture instruction>' --output-format stream-json --verbose ...
```

It emitted valid `system`, `assistant`, and `result` records but explicitly returned `authentication_failed` / `Not logged in · Please run /login`, with zero usage/cost. This is the exact `auth_unavailable` behavior the adapter must surface. No token store was read.

Protocol/cancellation command:

```bash
node spikes/claude-spike.mjs
```

Observed PASS against an isolated Anthropic-compatible loopback fixture:

- Structured record types were `system`, `assistant`, and `result`; a session ID was present.
- Final result was `FIXTURE_OK`; result usage and cost fields were present.
- Only `HEAD /` and `POST /v1/messages?beta=true` reached the loopback stub.
- A deliberately stalled request was cancelled through its detached process group and exited `143`.
- The dummy API key was scoped to that subprocess/loopback endpoint and was not persisted.

Conclusion: headless invocation, structured user-visible output, version/auth failure normalization, usage parsing, and safe cancellation are feasible. A real vendor-backed task remains environment-dependent on the user completing `claude /login`; this is not an undocumented adapter workaround.

## SPIKE-03 — Codex headless

Two installations were discovered:

- `/opt/homebrew/bin/codex` from global `@openai/codex@0.120.0` was broken because its platform binary path did not exist (`ENOENT`).
- The official ChatGPT/Codex extension bundled binary was usable at version `codex-cli 0.145.0-alpha.18`; `codex login status` reported `Logged in using ChatGPT`.

This proves executable resolution cannot trust the first PATH hit; `doctor` must execute a version probe and report remediation/fallback discovery without silently switching identity.

Live command in a committed temporary fixture:

```bash
<resolved-codex> exec --json --sandbox workspace-write --ephemeral \
  --ignore-user-config --ignore-rules -C <fixture> \
  'Fix the implementation so npm test passes. Make the smallest change, run the tests, and do not alter tests.'
```

Observed PASS:

- JSONL included `thread.started`, `turn.started`, agent messages, command start/completion, file-change start/completion, and `turn.completed`.
- Codex observed the failing test, made the one-line `a - b` → `a + b` implementation change, did not edit tests, and reran the full test successfully.
- Terminal usage reported input, cached input, output, and reasoning output tokens.
- Post-run independent check: `npm test` passed 1/1, `git diff --check` passed, and only `src/add.js` was modified.
- A second `read-only`, ephemeral JSONL run was interrupted after `thread.started`/`turn.started`; Ctrl-C closed the process session, a subsequent poll found no process, and the post-cancel diff/test state remained exactly the successful one-line change.

Official Codex documentation used by the contract states that `codex exec` is the stable non-interactive path, `--json` emits JSONL events, progress goes to stderr, sandbox modes are explicit, and `turn.completed` may carry usage. Source: [Codex non-interactive mode](https://developers.openai.com/codex/non-interactive) (also captured through the current Codex manual helper during the spike).

Conclusion: live authenticated headless editing, structured event/usage capture, sandbox selection, final grading, and interruption are feasible. Executable/version health is a material preflight requirement.

## SPIKE-04 — Safe Git worktree lifecycle

Command:

```bash
node spikes/local-feasibility.mjs
```

Observed PASS in a unique temporary repository:

- Created a detached worktree at an exact baseline SHA and verified its canonical path through `git worktree list --porcelain`.
- Seeded partial trial evidence, started a detached worker, cancelled only that worker group (`SIGTERM`), and retained the evidence for inspection.
- Removed exactly the recorded worktree with Git, verified the path disappeared from Git's list and disk, and left the primary worktree/HEAD unchanged.
- A pre-existing untracked `unrelated-user-file.txt` remained present and unchanged.

Conclusion: create → seed → run → interrupt → inspect/retain → exact cleanup is feasible without altering unrelated repository state. The implementation must serialize per-repository worktree mutations and validate ownership immediately before cleanup.

## SPIKE-05 — Historical task reconstruction

The same script created three PR-shaped commits (`add`, `multiply`, `isEven`) over a repository with buggy parent state. For each commit it:

1. resolved the exact parent and created a detached worktree;
2. proved the commit's new test was absent before the simulated agent patch;
3. applied only the implementation portion of the human patch;
4. extracted/injected the held-back test after the patch;
5. graded with `node --test`;
6. cleaned the exact worktree.

Observed PASS: all three had `hiddenBeforeAgent:true`, `injectedAfterPatch:true`, and `gradeExitCode:0`, with distinct recorded parent/commit SHAs.

Conclusion: parent reconstruction, reference-patch separation, post-run hidden test injection, and deterministic grading are feasible for simple linear commits. Merge commits, dependency drift, LFS/submodules, flaky tests, and real-world test extraction remain explicit miner filters rather than assumed support.

## SPIKE-06 — Trace differential and diagnosis

The deterministic fixture compared:

- Trace A: read `src/add.js`, read the focused test, run the focused test successfully.
- Trace B: unsuccessful broad search/read, broad `npm test` failure, then relevant source read and focused test success.

The output preserved file order, command lists, test order/outcomes, and produced a high-confidence `discovery` diagnosis citing exact event IDs `a1..a3` and `b1..b6`. It also recorded the alternative explanation that a broad test may be justified in a larger repository.

Conclusion: observable cross-trace feature extraction and evidence-linked diagnosis are feasible without hidden reasoning. Diagnosis must preserve alternatives and cannot generalize fixture ordering into a universal rule.

## Cross-spike findings

1. Structured JSONL exists for all three launch adapters, but event richness differs; unsupported file/search/edit details must remain explicit.
2. Auth is per-vendor environment state. PatchRace can detect and explain it but must never copy or reverse-engineer auth material.
3. Executable presence is insufficient: version command health and supported range are mandatory.
4. Owned process groups and raw-stream draining provide a workable cancellation baseline on macOS; Linux/Windows behavior remains later compatibility work.
5. Git and grader isolation contracts are feasible, but neither protects the host from malicious repository commands.
6. No spike revealed a blocker to a Node/TypeScript local CLI architecture.
