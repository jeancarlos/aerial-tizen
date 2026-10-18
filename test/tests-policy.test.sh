#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }

cd "$TMP"
git init -q -b main .
git config user.name Dev
git config user.email dev@example.com
mkdir test src
commit() { git add -A; git commit -q --allow-empty -m "$1" ${2:+-m "$2"}; }
echo base > src/a; commit "chore: base"
base=$(git rev-parse HEAD)
run() { bash "$ROOT/tools/check-tests.sh" "$base" HEAD 2>/dev/null; }
reset() { git reset -q --hard "$base"; }

echo ""
echo "Fixes-have-tests checks:"

echo 1 > src/a; commit "fix: stop the crash"
if run; then fail "A fix with no test file fails"; else ok "A fix with no test file fails"; fi
reset

echo 1 > src/a; echo t > test/a; commit "fix(player)!: stop the crash"
if run; then ok "A fix that touches test/ passes"; else fail "A fix that touches test/ passes"; fi
reset

echo 1 > src/a; commit "feat: new thing"
if run; then fail "A feat with no test file fails"; else ok "A feat with no test file fails"; fi
reset

echo 1 > src/a; commit "chore: tidy"
echo 2 > src/a; commit "docs: words"
if run; then ok "chore and docs need no test"; else fail "chore and docs need no test"; fi
reset

echo 1 > src/a; commit "fix: wording only" "No-Test: copy change"
if run; then ok "A No-Test line with a reason exempts the commit"; else fail "A No-Test line with a reason exempts the commit"; fi
reset

echo 1 > src/a; commit "fix: wording only" "No-Test:"
if run; then fail "An empty No-Test line is refused"; else ok "An empty No-Test line is refused"; fi

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
