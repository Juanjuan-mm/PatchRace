#!/bin/sh

while read -r status duration name; do
  case "$status $duration $name" in
    *fail*) printf '%s\n' "$name" ;;
  esac
done
