# TypeScript: Retry-After parser

A small HTTP client has a production-shaped bug: it understands numeric
`Retry-After` seconds but not an HTTP-date, and it rounds fractional seconds
instead of rounding up. The deterministic test covers seconds, fractional
seconds, future dates, expired dates, invalid values, and absent input.

`baseline/` is the task repository snapshot. `strong/` is public fixture input
for the deterministic passing harness; it is not hidden from a human reading
this example and is not presented as a leakage-resistant benchmark.

Run all examples from the repository root:

```bash
pnpm examples:verify
```

The race compares two synthetic Pi-compatible harnesses: one makes no change
and fails the hard test gate; the other applies the reviewed fix and passes.
This proves comparison mechanics for the recorded fixture, not TypeScript Agent
quality.
