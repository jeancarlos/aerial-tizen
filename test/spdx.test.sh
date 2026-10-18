#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: every source file states its copyright and licence in its first lines
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

passed=0
failed=0
missing=""

echo ""
echo "Per-file licence headers:"

while IFS= read -r f; do
  case "$f" in js/catalog.js|js/h264map.js) continue;; esac
  head -8 "$f" | grep -q 'SPDX-FileCopyrightText: ' && head -8 "$f" | grep -q 'SPDX-License-Identifier: MIT' && passed=$((passed + 1)) || { failed=$((failed + 1)); missing="$missing $f"; }
done < <(git ls-files '*.js' '*.mjs' '*.sh' '*.css' '*.html' '*.yml' '*.toml' ':!:demo/assets')

if [ "$failed" -eq 0 ]; then echo "  ✓ $passed source files carry the headers"; else echo "  ✗ missing:$missing"; fi
echo ""
echo "$((passed + failed)) tests, $passed passed, $failed failed"
[ "$failed" -eq 0 ]
