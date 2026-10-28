#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/project"
cat > "$TMP/project/config.xml" <<'XML'
<widget version="1.0.3"></widget>
XML
cat > "$TMP/project/package.json" <<'JSON'
{"version":"1.0.3"}
JSON
cat > "$TMP/project/package-lock.json" <<'JSON'
{"version":"1.0.3","packages":{"":{"version":"1.0.3"}}}
JSON
cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$GH_LOG"
case "${1:-}" in
  api)
    endpoint=""
    for arg in "$@"; do
      case "$arg" in
        */check-runs\?*) endpoint=checks ;;
        */pulls/*/reviews*) endpoint=reviews ;;
        */contents/*) endpoint=contents; file="${arg#*contents/}"; file="${file%%\?*}" ;;
      esac
    done
    case "$endpoint" in
      checks) printf '%s\n' "${GH_CHECKS:-1}" ;;
      reviews) printf '%s\n' "${GH_REVIEWS_JSON:-[]}" ;;
      contents) cat "$GH_PROJECT_ROOT/$file" ;;
      *) exit 1 ;;
    esac
    ;;
  pr)
    case "${2:-}" in
      view)
        state="$(cat "$GH_PR_STATE_FILE")"
        printf '{"state":"%s","baseRefName":"main","headRefName":"develop","headRefOid":"%s","mergeSha":"%s"}\n' "$state" "$GH_HEAD_SHA" "$GH_MERGE_SHA"
        ;;
      merge)
        printf 'merge %s\n' "$*" >> "$GH_LOG"
        printf 'MERGED\n' > "$GH_PR_STATE_FILE"
        ;;
      *) exit 1 ;;
    esac
    ;;
  workflow)
    printf '%s\n' "$*" >> "$GH_LOG"
    ;;
  *) exit 1 ;;
esac
GH
chmod +x "$TMP/bin/gh"

passed=0
failed=0
ok() { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }
run() { PATH="$TMP/bin:$PATH" GH_LOG="$TMP/gh.log" GH_PR_STATE_FILE="$TMP/pr-state" GH_PROJECT_ROOT="$TMP/project" BASE_VERSION="${BASE_VERSION:-1.0.2}" GH_HEAD_SHA=0123456789012345678901234567890123456789 GH_MERGE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa GH_REPO=jeancarlos/aerial-tizen CODEOWNER_LOGIN=jeancarlos GH_CHECKS="${GH_CHECKS:-1}" GH_REVIEWS_JSON="${GH_REVIEWS_JSON:-[]}" bash "$ROOT/tools/merge-promotion-pr.sh" 42 0123456789012345678901234567890123456789; }

approval='{"user":{"login":"jeancarlos"},"commit_id":"0123456789012345678901234567890123456789","state":"APPROVED","submitted_at":"2026-10-20T00:00:00Z"}'
comment='{"user":{"login":"jeancarlos"},"commit_id":"0123456789012345678901234567890123456789","state":"COMMENTED","submitted_at":"2026-10-21T00:00:00Z"}'
changes_requested='{"user":{"login":"jeancarlos"},"commit_id":"0123456789012345678901234567890123456789","state":"CHANGES_REQUESTED","submitted_at":"2026-10-22T00:00:00Z"}'

echo ""
echo "Promotion merge checks:"
: > "$TMP/gh.log"
printf 'OPEN\n' > "$TMP/pr-state"
if GH_REVIEWS_JSON="[[$comment]]" run; then
  if ! grep -q '^merge ' "$TMP/gh.log" && ! grep -q '^workflow run ' "$TMP/gh.log"; then ok "A comment does not count as code-owner approval"; else fail "A comment does not count as code-owner approval"; fi
else
  fail "A comment does not count as code-owner approval"
fi

: > "$TMP/gh.log"
printf 'OPEN\n' > "$TMP/pr-state"
if GH_REVIEWS_JSON="[[$approval]]" GH_CHECKS=0 run; then
  if ! grep -q '^merge ' "$TMP/gh.log" && ! grep -q '^workflow run ' "$TMP/gh.log"; then ok "Pending checks prevent the promotion merge"; else fail "Pending checks prevent the promotion merge"; fi
else
  fail "Pending checks prevent the promotion merge"
fi

: > "$TMP/gh.log"
printf 'OPEN\n' > "$TMP/pr-state"
if GH_REVIEWS_JSON="[[$approval,$comment]]" run; then
  if grep -qF 'merge 42 --repo jeancarlos/aerial-tizen --merge --match-head-commit 0123456789012345678901234567890123456789' "$TMP/gh.log" &&
    grep -qF 'workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=42 --field merge_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$TMP/gh.log" &&
    grep -qF -- 'repos/jeancarlos/aerial-tizen/pulls/42/reviews?per_page=100 --paginate --slurp' "$TMP/gh.log"; then
    ok "A comment after approval does not block the exact-head merge"
  else
    fail "A comment after approval does not block the exact-head merge"
  fi
else
  fail "A comment after approval does not block the exact-head merge"
fi

: > "$TMP/gh.log"
printf 'OPEN\n' > "$TMP/pr-state"
if GH_REVIEWS_JSON="[[$approval,$changes_requested]]" run; then
  if ! grep -q '^merge ' "$TMP/gh.log" && ! grep -q '^workflow run ' "$TMP/gh.log"; then
    ok "A later changes-requested review blocks the merge"
  else
    fail "A later changes-requested review blocks the merge"
  fi
else
  fail "A later changes-requested review blocks the merge"
fi

: > "$TMP/gh.log"
printf 'OPEN\n' > "$TMP/pr-state"
if BASE_VERSION=1.0.3 GH_REVIEWS_JSON="[[$approval]]" run; then
  fail "A manual promotion cannot reuse the current release version"
elif ! grep -q '^merge ' "$TMP/gh.log" && ! grep -q '^workflow run ' "$TMP/gh.log"; then
  ok "A manual promotion cannot reuse the current release version"
else
  fail "A manual promotion cannot reuse the current release version"
fi

: > "$TMP/gh.log"
printf 'MERGED\n' > "$TMP/pr-state"
if GH_REVIEWS_JSON="[[$approval,$comment]]" run; then
  if ! grep -q '^merge ' "$TMP/gh.log" && grep -qF 'workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=42 --field merge_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$TMP/gh.log"; then
    ok "A rerun after merge redispatches the release"
  else
    fail "A rerun after merge redispatches the release"
  fi
else
  fail "A rerun after merge redispatches the release"
fi

if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
