#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
sha_103=1111111111111111111111111111111111111111
sha_104=2222222222222222222222222222222222222222
sha_105=3333333333333333333333333333333333333333

cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  api)
    if [[ "$*" == *contents/package.json* ]]; then
      case "$*" in
        *"$GH_SHA_103"*) version=1.0.3 ;;
        *"$GH_SHA_104"*) version=1.0.4 ;;
        *"$GH_SHA_105"*) version=1.0.5 ;;
        *4444444444444444444444444444444444444444*) printf '{"status":"404"}\n'; exit 1 ;;
        *) exit 1 ;;
      esac
      printf '{"version":"%s"}\n' "$version"
    else
      printf '%s\n' "$GH_LATEST_TAG"
    fi
    ;;
  pr) printf '%s\n' "$GH_PR_LIST_JSON" ;;
  release) exit 0 ;;
  workflow) printf '%s\n' "$*" >> "$GH_LOG" ;;
  *) exit 1 ;;
esac
GH
chmod +x "$TMP/bin/gh"

PR_LIST="[{\"number\":79,\"mergeCommit\":{\"oid\":\"$sha_105\"}},{\"number\":78,\"mergeCommit\":{\"oid\":\"$sha_104\"}},{\"number\":77,\"mergeCommit\":{\"oid\":\"$sha_103\"}}]"
run() {
  PATH="$TMP/bin:$PATH" GH_REPO=jeancarlos/aerial-tizen GH_LATEST_TAG="$1" PUBLISHED_TAG="${2:-}" GH_PR_LIST_JSON="$PR_LIST" \
    GH_SHA_103="$sha_103" GH_SHA_104="$sha_104" GH_SHA_105="$sha_105" GH_LOG="$TMP/gh.log" bash "$ROOT/tools/resume-promotion-release.sh"
}

passed=0
failed=0
ok() { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }

: > "$TMP/gh.log"
run v1.0.3
if grep -qF "workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=78 --field merge_sha=$sha_104 --field released_tag=v1.0.3" "$TMP/gh.log" && ! grep -q 'pull_request=79' "$TMP/gh.log"; then
  ok "dispatches only the merged PR for the next patch"
else
  fail "dispatches only the merged PR for the next patch"
fi

: > "$TMP/gh.log"
run v1.0.4
if grep -qF "workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=79 --field merge_sha=$sha_105 --field released_tag=v1.0.4" "$TMP/gh.log" && ! grep -q 'pull_request=78' "$TMP/gh.log"; then
  ok "uses the latest stable release to choose the next queued patch"
else
  fail "uses the latest stable release to choose the next queued patch"
fi

: > "$TMP/gh.log"
PR_LIST="[{\"number\":79,\"mergeCommit\":{\"oid\":\"$sha_105\"}},{\"number\":78,\"mergeCommit\":{\"oid\":\"$sha_104\"}}]"
run v1.0.2
if [ ! -s "$TMP/gh.log" ]; then
  ok "leaves later promotions queued while the next patch is absent"
else
  fail "leaves later promotions queued while the next patch is absent"
fi

: > "$TMP/gh.log"
run v1.0.2 v1.0.3
if grep -qF "workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=78 --field merge_sha=$sha_104 --field released_tag=v1.0.3" "$TMP/gh.log"; then
  ok "uses the completed release when the latest-release API is stale"
else
  fail "uses the completed release when the latest-release API is stale"
fi

: > "$TMP/gh.log"
run v1.0.4 v1.0.3
if grep -qF "workflow run promote.yml --ref main --repo jeancarlos/aerial-tizen --field pull_request=79 --field merge_sha=$sha_105 --field released_tag=v1.0.4" "$TMP/gh.log"; then
  ok "does not replay an already published promotion on an older release retry"
else
  fail "does not replay an already published promotion on an older release retry"
fi

PR_LIST='[{"number":2,"mergeCommit":{"oid":"4444444444444444444444444444444444444444"}}]'
if run v1.0.3; then
  ok "ignores historical promotions without package.json"
else
  fail "ignores historical promotions without package.json"
fi

if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
