#!/bin/sh

awk -F '	' '
  NF != 3 || ($1 != "pass" && $1 != "fail") || $2 !~ /^[0-9]+$/ || $3 == "" {
    invalid = 1
    next
  }
  $1 == "fail" { print $3 }
  END { if (invalid) exit 2 }
'
