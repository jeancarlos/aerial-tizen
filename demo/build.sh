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
cp "$DIR/demo/list.js" "$DIR/demo/keys.js" "$DIR/demo/proxy.js" "$DIR/demo/config.js" \
  "$DIR/demo/avplay.js" "$DIR/demo/boot.js" "$DIR/demo/sim.css" \
  "$DIR/demo/favicon.ico" "$DIR/demo/manifest.webmanifest" "$OUT/"
cp -r "$DIR/demo/icons" "$OUT/"

PROXY="$(sed -n "s/.*DEMO_PROXY = '\(.*\)';.*/\1/p" "$DIR/demo/config.js")"
CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' $PROXY http://sylvan.apple.com https://sylvan.apple.com; manifest-src 'self'; base-uri 'none'; form-action 'none'"

# The page is the app's own index.html with the TV-only parts swapped for the
# browser stand-ins, so a new element in the app reaches the demo untouched.
sed \
  -e 's|<title>Aerial Screensaver</title>|<title>Aerial Screensaver - Simulator</title>|' \
  -e "s|<meta charset=\"UTF-8\">|&\n  <meta http-equiv=\"Content-Security-Policy\" content=\"$CSP\">|" \
  -e 's|<link rel="stylesheet" href="css/style.css">|&\n  <link rel="stylesheet" href="sim.css">|' \
  -e '/sim.css/r '"$DIR/demo/head.html" \
  -e '/<body>/r '"$DIR/demo/body-top.html" \
  -e 's|BACK to close|ESC to close|' \
  -e '/<object id="player"/d' \
  -e '\|\$WEBAPIS|{r '"$DIR/demo/body-end.html" \
  -e 'd}' \
  "$DIR/index.html" > "$OUT/index.html"

mkdir -p "$OUT/preload"
cp "$DIR"/demo/assets/thumbs/*.webp "$OUT/preload/"

# js/local-config.js is untracked and holds a LAN address. The public demo
# never talks to a server, so it ships a stub instead of whatever is on disk.
echo '// no deployment config in the public demo' > "$OUT/js/local-config.js"

echo "built $OUT"
