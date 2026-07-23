# Public three-Agent fixture comparison

This checked demo uses frozen, synthetic/captured public evidence for Pi, Claude
Code, and Codex against one tiny fixture task. It makes no network, credential,
or Agent call and is safe to reproduce with `pnpm m6:demo` after installation.

The result compares the recorded harness evidence only. One task and one captured
attempt per variant cannot establish universal Agent superiority; cost and token
metrics are deliberately unavailable. `report.json` is authoritative, while the
HTML, JUnit, and SARIF files are deterministic derived presentations.
Every report evidence link resolves to a checked patch, grade, normalized trace,
and result fixture under `trials/`.

Regenerate intentionally with `pnpm build` followed by
`node scripts/generate-m6-demo.mjs --write`, then review the complete diff and run
`pnpm m6:demo`.
