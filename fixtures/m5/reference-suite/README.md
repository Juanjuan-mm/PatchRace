# M5 replay reference suite

This versioned fixture inventory rebuilds every Git baseline and reviewed
reference commit in a fresh temporary repository. It performs no Agent/provider
call and uses no network or credential. The replay test lives in
`packages/tasks/src/reference-suite.test.ts` and preserves the static task
recipes in `manifest.json` so task intent is reviewable without embedding
machine-dependent commit IDs.

| Task | Ecosystem | Category | Verifier | Expected validity |
|---|---|---|---|---|
| `javascript-add` | JavaScript | logic | public | eligible |
| `javascript-slug` | JavaScript | text | public | eligible |
| `javascript-hidden-range` | JavaScript | boundary | external hidden | eligible |
| `javascript-deliberate-flake` | JavaScript | logic | public alternating reference | flaky |
| `python-total` | Python | logic | public | eligible |
| `python-normalize` | Python | text | public | eligible |
| `python-hidden-validator` | Python | boundary | external hidden | eligible |
| `config-json-mode` | repository config | configuration | public | eligible |
| `docs-install-heading` | repository config | documentation | public | eligible |
| `workflow-hidden-policy` | repository config | configuration | external hidden | eligible |

The aggregate replay covers manual initialization, deterministic commands and
assertions, reference validity, local Git mining, hidden-vault injection,
category-aware splitting, pre-grade integrity, and repeated-run statistics. The
deliberate flake uses a fixture-owned counter to produce a stable pass/fail
sequence and must be detected as `flaky` rather than accepted.

The test runs on an ordinary host, so its hidden-integrity result must be
`unknown` with `host-filesystem-not-enforced`; it never claims that a Git
worktree is a security sandbox. Hidden injection mechanics and content
non-disclosure are still exercised deterministically.
