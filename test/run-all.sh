#!/usr/bin/env bash
# Runs every suite. No network, no TV, no dependencies beyond node.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
failed=0

echo "== player =="
if node "$DIR/player.test.js"; then :; else failed=1; fi

echo
echo "== worker =="
if node "$DIR/worker.test.mjs"; then :; else failed=1; fi

echo
echo "== storage =="
if node "$DIR/storage.test.js"; then :; else failed=1; fi

echo
echo "== demo mocks =="
if node "$DIR/avplay.test.js"; then :; else failed=1; fi

echo
echo "== demo list =="
if node "$DIR/list.test.js"; then :; else failed=1; fi

echo
echo "== catalog data =="
if bash "$DIR/catalog-sync.test.sh"; then :; else failed=1; fi

echo
echo "== version =="
if bash "$DIR/version.test.sh"; then :; else failed=1; fi

echo
echo "== thumbnails =="
if bash "$DIR/thumbs.test.sh"; then :; else failed=1; fi

echo
echo "== deploy scripts =="
if bash "$DIR/deploy.test.sh"; then :; else failed=1; fi

echo
echo "== workflows =="
if bash "$DIR/workflows.test.sh"; then :; else failed=1; fi

echo
echo "== dco =="
if bash "$DIR/dco.test.sh"; then :; else failed=1; fi

echo
echo "== fixes have tests =="
if bash "$DIR/tests-policy.test.sh"; then :; else failed=1; fi

echo
echo "== ci-local =="
if bash "$DIR/ci-local.test.sh"; then :; else failed=1; fi

echo
echo "== release notes =="
if bash "$DIR/release-notes.test.sh"; then :; else failed=1; fi

echo
echo "== reproducible release =="
if bash "$DIR/reproducible.test.sh"; then :; else failed=1; fi

echo
echo "== demo =="
if bash "$DIR/demo.test.sh"; then :; else failed=1; fi

echo
if [ "$failed" -eq 0 ]; then
  echo "all suites passed"
else
  echo "FAILURES above" >&2
fi
exit "$failed"
