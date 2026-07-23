# QA-05 Performance and Resource Benchmark

Last updated: 2026-07-23

This benchmark measures PatchRace work separately from Agent inference and
repository dependency installation, as required by the frozen success
criteria. It uses deterministic no-op processes, scheduler delays, synthetic
normalized events, and a synthetic comparison report. No Agent, provider,
credential, network service, or paid model participates.

Run:

```bash
pnpm qa:performance
```

The command builds current sources, runs the benchmark, writes an ignored
`.artifacts/qa-performance.json`, and deletes its exact temporary input/report
directory in a `finally` block.

## Reference environment

- macOS 26.3, arm64
- Node 22.22.1
- 10 logical CPUs
- Date: 2026-07-23
- Two independent executions; both PASS

## Results

| Dimension | Frozen or declared gate | Observed run 1 | Observed run 2 | Result |
|---|---:|---:|---:|---|
| Scheduler-only overhead, 2,000 no-op trials | ≤ 2,000 ms/trial absolute branch | median 0.0261 ms/trial; maximum sample 0.0315 ms/trial | median 0.0248 ms/trial; maximum sample 0.0314 ms/trial | PASS |
| Node process runner overhead, 20 trials | ≤ 2,000 ms/trial absolute branch | median 32.95 ms; maximum/cold 299.89 ms | median 32.18 ms; maximum/cold 299.26 ms | PASS |
| Static HTML generation, ≥50 MiB normalized input | ≤ 10,000 ms | 26.89 ms | 24.75 ms | PASS |
| Peak report-process RSS | ≤ 750 MiB | 485.02 MiB | 485.05 MiB | PASS |
| Retained normalized JSON + HTML | within configured default 2,048 MiB disk budget | 102.47 MiB | 102.47 MiB | PASS |
| Scheduler concurrency, 40 × 20 ms jobs | exact max active 4; declared ≥2× speedup | max 4; 5.03× | max 4; 5.04× | PASS |
| Large trajectory input | retain at most 10,000 normalized events | 10,000/100,000, truncated in 47.75 ms | 10,000/100,000, truncated in 41.44 ms | PASS |

The report fixture serializes to 51.35 MiB and the inert HTML output is
51.12 MiB. The renderer remains comfortably inside the latency gate. Its
whole-document rendering model uses about 485 MiB peak RSS, leaving roughly
265 MiB of the frozen 750 MiB allowance; this is a real constraint, not a claim
that arbitrarily larger reports are cheap.

## Measurement boundary

The scheduler and runner use the absolute “≤2 seconds per trial” branch because
a zero-inference fixture has no meaningful inference denominator for a 5%
calculation. Process samples include executable startup and stream closure; the
first cold sample is reported rather than discarded. The concurrency benchmark
runs lock-free ready jobs and asserts the observed maximum active count, while
existing scheduler tests separately prove same-lock serialization and failure
isolation.

The 100,000-event trajectory benchmark proves bounded presentation output, not
bounded raw evidence retention: raw events remain durable and local-sensitive.
The 102.47 MiB disk figure includes only normalized JSON plus static HTML for
this fixture. Raw vendor streams, session data, patches, grades, and repeated
variants add to a real run, so the configured disk budget and explicit cleanup
remain authoritative.

## Rebenchmark triggers

Rerun and review this gate when any of these change:

- report rendering begins embedding rich patches, timelines, or assets by
  default;
- trace/timeline limits or normalized schemas change;
- scheduler/process lifecycle or stream persistence changes;
- Node support moves to a new major line;
- supported minimum hardware is materially smaller than this reference machine.

These local measurements do not replace beta activation timing or dogfood
reliability. Those remain separate M10 gates.
