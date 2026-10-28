#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$GH_LOG"
case "${1:-}" in
  api)
    if [[ "$2" == */check-runs?* ]]; then
      printf '%s\n' "${GH_CHECKS:-1}"
    elif [[ "$2" == */pulls/*/reviews ]]; then
      printf '%s\n' "${GH_REVIEW_STATE:-}"
    else
      exit 1
    fi
    ;;
  pr)
    case "${2:-}" in
      view) printf '%s\n' "${GH_PR_STATE:-OPEN}" ;;
      merge) printf '%s\n' "merge $*" >> "$GH_LOG" ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
GH
chmod +x "$TMP/bin/gh"

passed=0
failed=0
ok() { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }
run() { PATH="$TMP/bin:$PATH" GH_LOG="$TMP/gh.log" GH_REPO=jeancarlos/aerial-tizen CODEOWNER_LOGIN=jeancarlos GH_CHECKS="${GH_CHECKS:-1}" GH_REVIEW_STATE="${GH_REVIEW_STATE:-}" bash "$ROOT/tools/merge-promotion-pr.sh" 42 0123456789012345678901234567890123456789; }

echo ""
echo "Promotion merge checks:"
: > "$TMP/gh.log"
if GH_REVIEW_STATE=COMMENTED run; then
  if ! grep -q '^merge ' "$TMP/gh.log"; then ok "A comment does not count as code-owner approval"; else fail "A comment does not count as code-owner approval"; fi
else
  fail "A comment does not count as code-owner approval"
fi

: > "$TMP/gh.log"
if GH_REVIEW_STATE=APPROVED GH_CHECKS=0 run; then
  if ! grep -q '^merge ' "$TMP/gh.log"; then ok "Pending checks prevent the promotion merge"; else fail "Pending checks prevent the promotion merge"; fi
else
  fail "Pending checks prevent the promotion merge"
fi

: > "$TMP/gh.log"
if GH_REVIEW_STATE=APPROVED run; then
  if grep -qF 'merge 42 --repo jeancarlos/aerial-tizen --merge --match-head-commit 0123456789012345678901234567890123456789' "$TMP/gh.log" &&
    grep -qF 'select(.user.login == "jeancarlos" and .commit_id == "0123456789012345678901234567890123456789")' "$TMP/gh.log"; then
    ok "The current code-owner approval and checks merge the exact head"
  else
    fail "The current code-owner approval and checks merge the exact head"
  fi
else
  fail "The current code-owner approval and checks merge the exact head"
fi

if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
