#!/usr/bin/env bash
# Runs every suite. No network, no TV, no dependencies beyond node.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
failed=0

echo "== player =="
if node "$DIR/player.test.js"; then :; else failed=1; fi

echo
echo "== catalog data =="
if bash "$DIR/catalog-sync.test.sh"; then :; else failed=1; fi

echo
if [ "$failed" -eq 0 ]; then
  echo "all suites passed"
else
  echo "FAILURES above" >&2
fi
exit "$failed"
