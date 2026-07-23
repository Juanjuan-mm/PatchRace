# Task

Fix `bin/select-failures.sh`.

Read TSV rows with exactly three fields: status (`pass` or `fail`), a
non-negative integer duration in milliseconds, and a non-empty test name.
Print failed names in input order. Preserve spaces and shell metacharacters as
data. Exit non-zero on any malformed row and never evaluate input.
