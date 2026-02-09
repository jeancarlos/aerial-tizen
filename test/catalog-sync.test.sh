#!/usr/bin/env bash
# Test: catalog.js and h264map.js must stay in sync and use http:// only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROOT/js/catalog.js"
H264MAP="$ROOT/js/h264map.js"

passed=0
failed=0

ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; }

check() { if "$@"; then ok "$msg"; else fail "$msg"; fi; }

# Extract URLs from catalog.js ("url": "...")
catalog_urls=$(grep -oP '"url":\s*"\K[^"]+' "$CATALOG" | sort)
catalog_count=$(echo "$catalog_urls" | wc -l)

# Extract keys from h264map.js ('key': 'value')
map_keys=$(grep -oP "^\s*'\K[^']+(?=':)" "$H264MAP" | sort)
map_values=$(grep -oP "':\s*'\K[^']+" "$H264MAP" | sort)
map_count=$(echo "$map_keys" | wc -l)

# ── Protocol checks ──
echo ""
echo "Protocol checks:"

msg="catalog.js has no https:// URLs"
https_catalog=$(echo "$catalog_urls" | grep -c '^https://' || true)
check [ "$https_catalog" -eq 0 ]

msg="h264map.js keys have no https:// URLs"
https_keys=$(echo "$map_keys" | grep -c '^https://' || true)
check [ "$https_keys" -eq 0 ]

msg="h264map.js values have no https:// URLs"
https_values=$(echo "$map_values" | grep -c '^https://' || true)
check [ "$https_values" -eq 0 ]

msg="All $catalog_count catalog URLs use http://"
http_catalog=$(echo "$catalog_urls" | grep -c '^http://' || true)
check [ "$http_catalog" -eq "$catalog_count" ]

# ── Sync checks ──
echo ""
echo "Sync checks:"

missing=$(comm -23 <(echo "$catalog_urls") <(echo "$map_keys"))
msg="Every catalog URL has an h264map entry"
if [ -z "$missing" ]; then
  ok "$msg"
else
  n=$(echo "$missing" | wc -l)
  fail "$msg — $n missing:"
  echo "$missing" | sed 's/^/    /'
fi

extra=$(comm -13 <(echo "$catalog_urls") <(echo "$map_keys"))
msg="No extra h264map keys without catalog entry"
if [ -z "$extra" ]; then
  ok "$msg"
else
  n=$(echo "$extra" | wc -l)
  fail "$msg — $n extra:"
  echo "$extra" | sed 's/^/    /'
fi

msg="Same count: catalog=$catalog_count h264map=$map_count"
check [ "$catalog_count" -eq "$map_count" ]

# ── Duplicate checks ──
echo ""
echo "Duplicate checks:"

dupes=$(echo "$catalog_urls" | uniq -d)
msg="No duplicate catalog URLs"
if [ -z "$dupes" ]; then
  ok "$msg"
else
  n=$(echo "$dupes" | wc -l)
  fail "$msg — $n dupes:"
  echo "$dupes" | sed 's/^/    /'
fi

# ── Summary ──
total=$((passed + failed))
echo ""
if [ "$failed" -eq 0 ]; then
  echo "$total tests, $passed passed, 0 failed"
else
  echo "$total tests, $passed passed, $failed failed"
fi
echo ""
exit "$failed"
