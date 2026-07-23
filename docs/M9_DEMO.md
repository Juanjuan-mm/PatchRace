# M9 Pi-Native Workflow

Last updated: 2026-07-23

This is the checked, provider-free M9 acceptance flow. It exercises the same Pi
extension command handlers and durable CLI services used by a real project, but
uses captured deterministic bridge responses instead of an Agent/provider.

## Install and load

From a trusted project:

```bash
pnpm --filter pi-patchrace build
pi install -l ./packages/pi-extension --approve
```

Pi discovers the compiled entry declared in `package.json`. `/patchrace reload`
uses Pi's extension reload lifecycle without a model call. `pnpm pi:compat`
checks this on an isolated Pi configuration and project.

## Complete flow

1. Start a race:

   ```text
   /race --config .patchrace/suite.yaml --variants pi,claude,codex --repeat 1
   ```

   Pi shows the exact argv and warns that trusted repository commands and
   configured Agent budgets may be consumed. Declining makes no bridge call.

2. Inspect deterministic diagnosis:

   ```text
   /coach <run-id>
   ```

   The TUI separates deterministic hard-gate facts and rule findings from
   optional inferred hypotheses. Every finding shows an artifact hash/path and
   event or grade-gate IDs. Unresolved citations fail closed.

3. Review the candidate:

   ```text
   /review <candidate-id>
   ```

   The TUI verifies each unified diff hash, then displays exact changes,
   validation and selection evidence, safety flags, expected effect, cost, and
   authority limitations. Approve enables validation only; reject is a retained
   terminal review decision.

4. Promote through the preview:

   ```text
   /promote <candidate-id>
   ```

   Pi first displays the optimizer's recomputed project-local promotion plan.
   A separate confirmation is required before exact writes. Promotion does not
   commit, push, publish, install, or touch global Pi state.

5. Roll back through the reverse preview:

   ```text
   /rollback <promotion-id>
   ```

   Pi displays recorded restore hashes and confirms again. Any diverged
   postimage is a conflict; PatchRace never overwrites it.

6. Restore status after restart, reload, or compaction:

   ```text
   /status
   ```

   The command uses the last Pi custom entry when available and otherwise
   discovers the newest owned project-local run. It opens only size/hash-checked
   indexed text artifacts.

## Checked evidence

`packages/pi-extension/src/workflow.test.ts` runs race → coach → review →
promotion preview/confirm → rollback preview/confirm in one Pi session and
asserts the exact bridge sequence and authority labels.

`packages/pi-extension/src/status.test.ts` checks durable rediscovery and
artifact navigation, including hash drift and symlink refusal.

`packages/cli/src/candidate-service.test.ts` uses real temporary staged bytes to
prove zero-write preview, exact promotion, unrelated-file preservation, and
exact rollback.

`pnpm pi:compat` uses trusted local Pi 0.81.1 in offline RPC mode to verify
project-local install/trust, all eight commands, resource disable/re-enable,
reload, targeted update, and uninstall. Git/npm install sources are planned
only; they are not fetched or published.
