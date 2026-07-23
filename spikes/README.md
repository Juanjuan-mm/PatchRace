# M1 Feasibility Spikes

These disposable, deterministic probes support `SPIKE-01..06`. They use temporary repositories and process roots under `/private/tmp`; they do not treat worktrees as a security sandbox.

Expected local tools are Git, Node.js, Pi, Claude Code, and Codex. Agent spikes record versions and structured observable output but never read credential files or print token values.

Run deterministic local spikes:

```bash
node spikes/pi-spike.mjs
node spikes/local-feasibility.mjs
```

Claude and Codex live spikes are intentionally separate because they use the user's existing authenticated official CLIs and vendor service. Their exact commands and redacted results are recorded in `docs/spikes/M1_SPIKE_EVIDENCE.md`.

