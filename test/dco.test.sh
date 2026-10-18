#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: check-dco.sh fails exactly the commits that need a sign-off
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
export GIT_COMMITTER_DATE="2026-10-20T00:00:00Z"
commit() { GIT_AUTHOR_DATE="${3:-2026-10-20T00:00:00Z}" git commit -q --allow-empty ${2:+--author="$2"} -m "$1" ${4:+-m "$4"}; }
commit base "" 2026-01-01T00:00:00Z
base=$(git rev-parse HEAD)
run() { DCO_FROM=2026-10-17T17:00:00Z bash "$ROOT/tools/check-dco.sh" "$base" HEAD 2>/dev/null; }

echo ""
echo "DCO checks:"

commit signed "" 2026-10-20T00:00:00Z "Signed-off-by: Dev <dev@example.com>"
if run; then ok "A signed commit passes"; else fail "A signed commit passes"; fi

commit unsigned
if run; then fail "An unsigned commit fails"; else ok "An unsigned commit fails"; fi

git reset -q --hard HEAD~1
commit bot "dependabot[bot] <bot@example.com>"
if run; then ok "A bot commit is skipped"; else fail "A bot commit is skipped"; fi

git reset -q --hard HEAD~1
commit old "" 2026-01-02T00:00:00Z
if run; then ok "A commit older than the rule is skipped"; else fail "A commit older than the rule is skipped"; fi

git reset -q --hard HEAD~1
commit badsign "" 2026-10-20T00:00:00Z "Signed-off-by: x"
if run; then fail "A sign-off without an email is refused"; else ok "A sign-off without an email is refused"; fi

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
