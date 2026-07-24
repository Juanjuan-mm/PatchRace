# Python: Invoice totals

A CSV aggregation helper uses binary floating point and accepts malformed money
values. The task requires exact decimal arithmetic, deterministic customer
ordering, whitespace normalization, and rejection of blank customer IDs,
negative amounts, or fractional cents.

`baseline/` is the exact task snapshot and `strong/` is the public reviewed
fixture fix. `pnpm examples:verify` races a no-change synthetic harness against
the passing fix, runs the real Python standard-library test, and retains a local
report under `.artifacts/examples/`.

This is deterministic fixture evidence, not a live Python Agent benchmark.
