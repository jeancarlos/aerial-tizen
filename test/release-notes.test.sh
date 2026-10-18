#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: release notes are the tag's CHANGELOG section plus the upgrade impact, and a tag without one fails
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }

out="$("$ROOT/tools/release-notes.sh" v1.0.2 2>&1)"
echo "$out" | grep -q 'refuses a tag that does not match' && ok "v1.0.2 gets its own section" || fail "v1.0.2 gets its own section"
echo "$out" | grep -q 'Replaces 1.0.0' && fail "v1.0.2 does not leak the 1.0.1 section" || ok "v1.0.2 does not leak the 1.0.1 section"
echo "$out" | grep -q '^Upgrade: ' && ok "notes end with the upgrade impact" || fail "notes end with the upgrade impact"
"$ROOT/tools/release-notes.sh" v9.9.9 >/dev/null 2>&1 && fail "a tag without a section fails" || ok "a tag without a section fails"
grep -q 'release-notes.sh' "$ROOT/.github/workflows/release.yml" && ok "release.yml publishes those notes" || fail "release.yml publishes those notes"
grep -q -- '--generate-notes' "$ROOT/.github/workflows/release.yml" && fail "release.yml no longer generates notes from pull requests" || ok "release.yml no longer generates notes from pull requests"

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
