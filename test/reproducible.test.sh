#!/usr/bin/env bash
# Test: the release archive is bit-for-bit reproducible from the commit
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }
check() { if "$@"; then ok "$msg"; else fail "$msg"; fi; }

echo ""
echo "Reproducible release:"

cd "$ROOT"
args=$(grep -o 'git archive [^ ]* [^ ]* [^ ]*' .github/workflows/release.yml | head -1)

msg="The release job stores files uncompressed, so zlib versions cannot change the bytes"
check bash -c "[[ '$args' == *' -0 '* ]]"

git archive --format=zip -0 --prefix=aerial-tizen-test/ HEAD > "$TMP/a.zip"
sleep 1
git archive --format=zip -0 --prefix=aerial-tizen-test/ HEAD > "$TMP/b.zip"

msg="Two archives of the same commit are identical"
check cmp -s "$TMP/a.zip" "$TMP/b.zip"

echo ""
echo "$((passed + failed)) tests, $passed passed, $failed failed"
[ "$failed" -eq 0 ]
