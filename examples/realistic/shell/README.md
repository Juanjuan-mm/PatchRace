# POSIX shell: Failure selector

A CI helper must read tab-separated `status`, `duration_ms`, and `test_name`
records from stdin and print only failed test names in input order. Test names
may contain spaces or shell metacharacters. Malformed status/duration rows must
fail without evaluating input as shell code.

The baseline uses whitespace splitting and matches the word “fail” anywhere;
the reviewed fixture uses `awk -F '\t'` with exact field validation. The
verification runs with `/bin/sh` and standard `awk`, available on supported
macOS/Linux systems.

`pnpm examples:verify` produces a real PatchRace comparison. It is fixture
evidence for a shell-tooling repository, not live Agent quality evidence.
