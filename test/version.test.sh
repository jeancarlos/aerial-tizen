#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: the three version fields agree and the release guard rejects a wrong tag
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
echo "Version checks:"

msg="config.xml, package.json and package-lock.json agree"
check bash -c "bash '$ROOT/tools/check-version.sh' >/dev/null"

version=$(bash "$ROOT/tools/check-version.sh" | cut -d' ' -f2)

msg="The matching tag v$version is accepted"
check bash -c "bash '$ROOT/tools/check-version.sh' v$version >/dev/null"

msg="A tag for another version is refused"
check bash -c "! bash '$ROOT/tools/check-version.sh' v0.0.0 >/dev/null 2>&1"

mkdir -p "$TMP/tools"
cp "$ROOT/tools/check-version.sh" "$TMP/tools/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$TMP/"
sed -E 's/( version=")[0-9]+\.[0-9]+\.[0-9]+/\19.9.9/' "$ROOT/config.xml" > "$TMP/config.xml"

msg="A config.xml that drifted from package.json is refused"
check bash -c "! bash '$TMP/tools/check-version.sh' >/dev/null 2>&1"

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
