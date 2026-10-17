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

# js/local-config.js is untracked and holds a LAN address. The public demo
# never talks to a server, so it ships a stub instead of whatever is on disk.
# The real thumbnails are Apple's footage and are not in the repository, so the
# demo draws its own: one gradient per category, under every video's file name.
mkdir -p "$OUT/preload" "$OUT/.tint"
for pair in space:#050a1f-#1b3a78 sea:#031a2b-#1b7fa0 landscape:#14231a-#8a9a5b cityscape:#1a1020-#d9822b; do
  convert -size 1920x1080 "gradient:${pair#*:}" -quality 60 "$OUT/.tint/${pair%%:*}.webp"
done
node -e '
  var c = {}; new Function("var CATALOG; " + require("fs").readFileSync(process.argv[1], "utf8") + "; this.c = CATALOG;").call(c);
  c.c.forEach(function (v) { console.log(v.category + " " + v.url.split("/").pop().replace(/\.(mov|mp4)$/, ".webp")); });
' "$DIR/js/catalog.js" | while read -r category file; do
  cp "$OUT/.tint/$category.webp" "$OUT/preload/$file"
done
rm -rf "$OUT/.tint"

echo '// no deployment config in the public demo' > "$OUT/js/local-config.js"

echo "built $OUT"
