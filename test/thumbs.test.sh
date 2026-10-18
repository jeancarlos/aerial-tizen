#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: make-thumbs.sh writes where and how big each mode says it does
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/repo/tools" "$TMP/repo/js"
cp "$ROOT/tools/make-thumbs.sh" "$TMP/repo/tools/"
printf '[{"url": "http://x/a.mov"}]\n' > "$TMP/repo/js/catalog.js"
cat > "$TMP/bin/ffmpeg" <<'STUB'
#!/usr/bin/env bash
for last; do :; done
echo "$*" >> "$STUB_LOG"
: > "$last"
STUB
chmod +x "$TMP/bin/ffmpeg"

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }
check() { if "$@"; then ok "$msg"; else fail "$msg"; fi; }

export STUB_LOG="$TMP/ffmpeg.log"
echo ""
echo "Thumbnail generator checks:"

PATH="$TMP/bin:$PATH" bash "$TMP/repo/tools/make-thumbs.sh" >/dev/null
msg="The default mode cuts full-size frames into preload/"
check grep -q 'scale=1920:1080' "$STUB_LOG"
msg="The default mode writes under preload/"
check [ -e "$TMP/repo/preload/a.webp" ]

: > "$STUB_LOG"
PATH="$TMP/bin:$PATH" bash "$TMP/repo/tools/make-thumbs.sh" --demo >/dev/null
msg="The demo mode cuts small frames"
check grep -q 'scale=960:540' "$STUB_LOG"
msg="The demo mode writes under demo/assets/thumbs"
check [ -e "$TMP/repo/demo/assets/thumbs/a.webp" ]

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
