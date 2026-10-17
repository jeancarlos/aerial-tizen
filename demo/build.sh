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
cp -r "$DIR/css" "$DIR/js" "$OUT/"
cp "$DIR/simulate.html" "$OUT/index.html"

# The real thumbnails are Apple's footage and are not in the repository, so the
# demo uses its own: one gradient per category, under every video's file name.
mkdir -p "$OUT/preload"
node -e '
  var c = {}; new Function("var CATALOG; " + require("fs").readFileSync(process.argv[1], "utf8") + "; this.c = CATALOG;").call(c);
  c.c.forEach(function (v) { console.log(v.category + " " + v.url.split("/").pop().replace(/\.(mov|mp4)$/, ".webp")); });
' "$DIR/js/catalog.js" | while read -r category file; do
  cp "$DIR/demo/tint/$category.webp" "$OUT/preload/$file"
done

# js/local-config.js is untracked and holds a LAN address. The public demo
# never talks to a server, so it ships a stub instead of whatever is on disk.
echo '// no deployment config in the public demo' > "$OUT/js/local-config.js"

echo "built $OUT"
