#!/usr/bin/env bash
#
# Assembles the public demo. The same script builds it in CI and locally, so
# what you check in a browser is what GitHub Pages serves.
#
#   bash demo/build.sh site && python3 -m http.server -d site 8000

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-site}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$DIR/css" "$DIR/js" "$DIR/preload" "$OUT/"
cp "$DIR/simulate.html" "$OUT/index.html"

# js/local-config.js is untracked and holds a LAN address. The public demo
# never talks to a server, so it ships a stub instead of whatever is on disk.
echo '// no deployment config in the public demo' > "$OUT/js/local-config.js"

echo "built $OUT"
