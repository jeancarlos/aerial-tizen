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

msg="No demo thumbnail is larger than 200 KB"
check [ -z "$(find "$OUT/site/preload" -type f -size +200k)" ]

msg="The demo page restricts scripts to its own origin"
check grep -q "http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'" "$OUT/site/index.html"

msg="The demo page has no inline event handler for the policy to block"
check [ -z "$(grep -c ' onclick=' "$OUT/site/index.html" | grep -v "^0$")" ]

msg="The demo page loads the list script it ships"
check grep -q 'src="list.js"' "$OUT/site/index.html"

msg="The demo page carries no stills-only disclaimer"
check [ -z "$(grep -c sim-note "$OUT/site/index.html" | grep -v "^0$")" ]

msg="The demo ships the list and key scripts"
check [ -s "$OUT/site/list.js" -a -s "$OUT/site/keys.js" -a -s "$OUT/site/proxy.js" -a -s "$OUT/site/config.js" ]

msg="The demo thumbnail fills the viewport like the video does"
check grep -Pzoq '#preload \{[^}]*width: calc\(100% \+ 4px\);\s*height: calc\(100% \+ 4px\);' "$OUT/site/sim.css"

msg="The demo video starts at the second the thumbnail is cut from"
check grep -q "urlFor(url) + '#t=1'" "$OUT/site/avplay.js"

msg="Backdrop blur sits on the blur class only, never on the base menu"
check sh -c 'grep -Pzoq "#menu\.blur \{[^}]*backdrop-filter" "$1" && ! grep -Pzoq "#menu \{[^}]*backdrop-filter" "$1"' _ "$ROOT/css/style.css"

msg="The list header is opaque so scrolled rows cannot show through it"
check grep -q "#catalog-list h2 {[^}]*background: rgb(" "$OUT/site/sim.css"

msg="The video list expands with a transition instead of popping in"
check grep -q "#catalog-list.open { visibility: visible; opacity: 1; transform: none; transition" "$OUT/site/sim.css"

msg="The demo video offers no picture-in-picture button"
check grep -q '<video id="sim-video" muted disablepictureinpicture' "$OUT/site/index.html"

msg="The demo is installable: favicon, manifest and both icons ship and are linked"
check sh -c 'cd "$1" && [ -s favicon.ico -a -s icons/icon-192.png -a -s icons/icon-512.png ] && grep -q "href=\"favicon.ico\"" index.html && grep -q "href=\"manifest.webmanifest\"" index.html && grep -q "icons/icon-512.png" manifest.webmanifest' _ "$OUT/site"

msg="The demo page loads the key script"
check grep -q 'src="keys.js"' "$OUT/site/index.html"

msg="Every element id of the app page is in the demo page, except the TV player"
app_ids=$(grep -o ' id="[^"]*"' "$ROOT/index.html" | grep -v 'id="player"' | sort -u)
demo_ids=$(grep -o ' id="[^"]*"' "$OUT/site/index.html" | sort -u)
check [ -z "$(comm -23 <(echo "$app_ids") <(echo "$demo_ids"))" ]

msg="The demo page is the app page with no TV-only leftovers"
check [ -z "$(grep -E 'WEBAPIS|avplayer' "$OUT/site/index.html")" ]

msg="Every script the app page loads is in the demo page, in the same order"
app_js=$(grep -o 'src="js/[^"]*"' "$ROOT/index.html")
demo_js=$(grep -o 'src="js/[^"]*"' "$OUT/site/index.html" | grep -v h264map)
check [ "$app_js" = "$demo_js" ]

msg="The demo mocks load before the app scripts"
check [ "$(grep -n 'src="boot.js"' "$OUT/site/index.html" | cut -d: -f1)" -lt "$(grep -n 'src="js/main.js"' "$OUT/site/index.html" | cut -d: -f1)" ]

msg="The demo menu hint names the keyboard key"
check grep -q 'ESC to close' "$OUT/site/index.html"

msg="The file server home page lists live files"
check grep -q "fetch('files.json')" "$ROOT/server/index.html"

msg="The file server home page loads the demo catalog"
check grep -q 'https://aerial.jeansouza.dev/catalog.js' "$ROOT/server/index.html"

msg="The file server home page shows a thumbnail per video"
check grep -q "'thumbnail/'" "$ROOT/server/index.html"

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
