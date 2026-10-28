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

if grep -q '^  workflow_dispatch:' "$ROOT/.github/workflows/dco.yml"; then
  ok "DCO workflow can validate generated branches"
else
  fail "DCO workflow can validate generated branches"
fi

if grep -q 'inputs.base' "$ROOT/.github/workflows/dco.yml"; then
  ok "DCO dispatch can scope validation to a chosen base commit"
else
  fail "DCO dispatch can scope validation to a chosen base commit"
fi

if grep -q 'inputs.head' "$ROOT/.github/workflows/dco.yml" && grep -q 'bash tools/check-dco.sh "$base" "$head"' "$ROOT/.github/workflows/dco.yml" && grep -q '\[ "$DISPATCH_HEAD" = "$GITHUB_SHA" \]' "$ROOT/.github/workflows/dco.yml"; then
  ok "DCO dispatch validates the exact workflow commit"
else
  fail "DCO dispatch validates the exact workflow commit"
fi

if grep -q '^  cleanup-dco-ref:' "$ROOT/.github/workflows/dco.yml" && grep -q 'git/refs/heads/$REF_NAME' "$ROOT/.github/workflows/dco.yml" && grep -qF 'Reference does not exist' "$ROOT/.github/workflows/dco.yml" && grep -qF '(404|422)' "$ROOT/.github/workflows/dco.yml"; then
  ok "DCO validation cleans up its temporary ref idempotently"
else
  fail "DCO validation cleans up its temporary ref idempotently"
fi

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

invalid_base=0000000000000000000000000000000000000000
if DCO_FROM=2026-10-17T17:00:00Z bash "$ROOT/tools/check-dco.sh" "$invalid_base" HEAD >/dev/null 2>&1; then
  fail "An invalid DCO range is refused"
else
  ok "An invalid DCO range is refused"
fi

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
