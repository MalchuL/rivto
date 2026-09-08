#!/usr/bin/env sh
set -eu

# pnpm forwards extra args after a bare "--". Drop those separators so Jest
# treats flags such as --no-coverage as options rather than test-name patterns.
args=""
for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    continue
  fi
  args="$args $arg"
done

# shellcheck disable=SC2086
exec node "${PWD}/node_modules/jest/bin/jest.js" $args
