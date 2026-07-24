#!/bin/sh
set -eu

actual="$(
  printf 'pass\t10\tunit one\nfail\t20\tintegration two; echo unsafe\nfail\t0\tlast test\n' |
    sh bin/select-failures.sh
)"
expected='integration two; echo unsafe
last test'
[ "$actual" = "$expected" ]

if printf 'oops\t10\tbad\n' | sh bin/select-failures.sh >/dev/null 2>&1; then
  echo "invalid status was accepted" >&2
  exit 1
fi
if printf 'fail\t1.5\tbad\n' | sh bin/select-failures.sh >/dev/null 2>&1; then
  echo "invalid duration was accepted" >&2
  exit 1
fi
if printf 'fail\t10\t\n' | sh bin/select-failures.sh >/dev/null 2>&1; then
  echo "blank name was accepted" >&2
  exit 1
fi
