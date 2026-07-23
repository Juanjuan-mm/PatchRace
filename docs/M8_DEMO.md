# M8 held-out Pi resource demo

Status: deterministic checked fixture evidence  
Last updated: 2026-07-23

## Claim boundary

This demo proves that the PatchRace teaching protocol can derive, validate, and
holdout-check one project-local Pi guidance mutation without leaking holdout
identities or hiding regressions. It does not measure a live model or establish
quality on arbitrary repositories, tasks, models, or vendors.

## Predeclared experiment

`fixtures/m8/heldout-demo.json` freezes twelve package-manager tasks across
bugfix and feature categories, the split seed, baseline guidance, the one
candidate fact, and these thresholds before the final gate:

- primary held-out success-rate improvement: at least `1.0`;
- context-token estimate increase: at most `50`;
- configuration-complexity increase: at most `2`;
- cost, latency, and edit-footprint increase: at most `0`;
- integrity, correctness, safety, and protected-path gates: all pass.

The deterministic fixture evaluator models whether the project-local Pi context
contains the required stable package-manager fact. It does not invoke an Agent.

## Protocol and result

The category-hash split produces eight training, two validation, and two final
holdout tasks. Candidate generation receives training evidence plus only the
holdout count and commitment; the checked proposal serialization contains no
holdout task ID. Validation freezes a correctness-first held-out policy and
selects the candidate before the single final gate opens.

The final holdout result is:

| Dimension | Baseline | Candidate | Allowed | Result |
|---|---:|---:|---:|---|
| Success rate | 0.0 | 1.0 | improvement ≥ 1.0 | PASS |
| Hard gates | pass | pass | no regression | PASS |
| Cost increase | — | 0 USD | ≤ 0 | PASS |
| Latency increase | — | 0 ms | ≤ 0 | PASS |
| Footprint increase | — | 0 lines | ≤ 0 | PASS |
| Context estimate increase | — | 20 tokens | ≤ 50 | PASS |
| Config complexity increase | — | 1 point | ≤ 2 | PASS |

The final ledger records `retuneAllowed: false`. A new tuning cycle would require
an independently reserved split manifest.

## Reproduce

```bash
pnpm m8:demo
```

The command builds the packages, recomputes the complete result, checks every
gate, and byte-compares canonical output with
`fixtures/m8/heldout-demo.expected.json`. It performs no provider, credential,
network, paid, global-Pi, promotion, or repository-resource write.
