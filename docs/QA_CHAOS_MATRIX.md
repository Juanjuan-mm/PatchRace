# QA-03 Worktree and Process Chaos Matrix

Last updated: 2026-07-23

This matrix exercises failure handling at the local Git, process, budget,
artifact, lease, and cleanup boundaries. It uses temporary repositories and
processes only. It does not invoke an Agent, provider, credential, network
service, or paid model.

Run the release-facing matrix with:

```bash
pnpm qa:chaos
```

## Executed cases

| Failure class | Injection | Required result |
|---|---|---|
| Dirty primary repository | Modify a tracked file and add an untracked user file before trial creation. | The detached trial starts from the exact baseline commit; primary dirty and untracked content remains unchanged. |
| Conflicting worktree branch | Commit a different HEAD inside the recorded trial worktree before cleanup. | Cleanup reports `WORKTREE_OWNERSHIP_CONFLICT` and retains both the worktree and primary repository. |
| Signal escalation | Start a group descendant that ignores `SIGTERM`, then exhaust the parent time budget. | PatchRace drains already-written output, escalates only the owned group, and the descendant cannot escape to write later. |
| Unrelated process | Keep a separate Node process alive beside the timed-out group. | The unrelated PID remains live and is terminated only by test teardown. |
| Agent crash | Exit nonzero after writing stdout and stderr. | The result is failed with the exact exit code and both partial streams are retained. |
| Stale lease | Pre-create the exact run lease with stale-looking metadata. | Recovery refuses with `RUN_LEASE_CONFLICT`; it neither guesses PID ownership nor removes/replaces the lease or run evidence. |
| Disk pressure | Consume the exact hard disk budget during the first scheduled job. | The active job is marked budget-exhausted and no queued job is admitted; unrelated files remain unchanged. |
| Partial event tail | Append an incomplete final JSONL record. | Recovery truncates only that tail and records the truncated byte count. |
| Finalized artifact drift | Change an indexed artifact after finalization. | Recovery reports the hash mismatch, marks `needsInspection`, and offers no resumable trials. |
| Complete malformed evidence | Insert newline-terminated malformed JSON or corrupt the finalized index. | The bytes remain inspectable and recovery returns `needsInspection` rather than silently truncating or losing the run-level result. |
| Cleanup ownership swap | Change a run owner after cleanup planning. | Execution fails before deletion with `CLEANUP_OWNERSHIP_CHANGED`. |
| Cleanup symlink swap | Replace a planned cache directory with a symlink to user data. | Canonical-path validation fails before deletion; both the destination and retained owned directory survive. |

## Boundary and residual risk

These tests prove fail-closed behavior for controlled local faults on supported
macOS and Linux primitives. They do not claim that Git worktrees sandbox
filesystem, process, credential, or network access. Real filesystem exhaustion,
kernel failure, power loss at every individual write instruction, PID reuse
races after a controller crash, hostile privileged processes, and unsupported
platform behavior remain outside this deterministic matrix. Recovery therefore
continues to retain ambiguous state for manual inspection.
