#!/usr/bin/env bash
# Test: the published demo carries a thumbnail per video and no Apple footage
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }
check() { if "$@"; then ok "$msg"; else fail "$msg"; fi; }

bash "$ROOT/demo/build.sh" "$OUT/site" >/dev/null

echo ""
echo "Demo checks:"

want=$(bash "$ROOT/tools/make-thumbs.sh" --list | sort)
have=$(cd "$OUT/site/preload" && find . -type f -name '*.webp' -size +0 -printf '%f\n' | sort)

msg="Every catalog video has a demo thumbnail"
check [ "$want" = "$have" ]

msg="The demo thumbnails are drawn, not cut from Apple's footage (under 100 KB each)"
check [ -z "$(find "$OUT/site/preload" -type f -size +100k)" ]

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
