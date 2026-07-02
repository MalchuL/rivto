#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

exec pnpm exec jest "$@"
