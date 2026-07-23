# pi-patchrace

Pi-native PatchRace commands over PatchRace's stable machine-readable command
surface. The extension never starts another Pi session: it launches the local
`patchrace` executable with an argument array, keeps human progress out of
machine output, and restores its last durable run pointer from Pi session
entries.

## Project-local development

Build the workspace, then install this package only for the trusted project:

```bash
pnpm --filter pi-patchrace build
pi install -l ./packages/pi-extension
```

For hot reload, keep the compiler running:

```bash
pnpm --filter pi-patchrace dev
```

Run `/reload` inside Pi after a rebuild. Pi reads the extension declared by the
package manifest from `dist/index.js`. Project-local packages are loaded only
after Pi's project-trust decision.

Use `/patchrace doctor` to verify that the `patchrace` executable and configured
local environment are ready. The extension does not read credentials and does
not invoke a provider during readiness inspection. `/patchrace reload` invokes
Pi's extension reload lifecycle directly and does not require a model/provider.

Use `/race` for an interactive configuration wizard, or pass explicit options:

```text
/race --config .patchrace/suite.yaml --variants pi,claude,codex --repeat 2
/race inspect <run-id>
```

Before a race starts, the TUI shows the exact command and confirms that trusted
repository commands and configured Agent budgets may be consumed. Declining
leaves the repository and session unchanged. Race execution occurs in a child
process, so the current Pi session remains open; the resulting run pointer is
stored as a Pi custom session entry and can be restored after reload.

Use `/diagnose <run-id>` or `/coach <run-id>` to render deterministic hard-gate
facts, evidence-linked rule findings, coach recommendations, and optional
inferred hypotheses in separate TUI sections. Evidence paths and hashes must
resolve to the immutable diagnosis artifact inventory or the extension refuses
the result. `--reflect` is never implicit: Pi warns that it may invoke a
configured LLM over redacted evidence and requires confirmation first.

Use `/review <candidate-id>` to inspect a hash-verified exact diff, validation
and selection evidence, safety flags, cost, and authority limits. Pending
candidates expose explicit approve-for-validation and reject actions. Eligible
approved candidates may continue to a promotion preview. `/promote
<candidate-id>` is always preview-first and confirms again before project-local
writes; `/rollback <promotion-id>` previews exact preimages and refuses
diverged files. None of these commands commit, push, publish, or touch global Pi
state.

Use `/status [run-id]` to restore the latest durable run after restart,
`/reload`, or compaction and navigate hash-verified text reports and artifacts.
The navigator reads only the project-local owned run root and rejects symlinks,
path escapes, binary files, size drift, hash drift, and displays larger than 2
MiB.
