#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Cuts one transition thumbnail per catalog video into preload/.
#
#   bash tools/make-thumbs.sh          cut the ones that are missing
#   bash tools/make-thumbs.sh --list   print the file names the player asks for
#   bash tools/make-thumbs.sh --demo   cut small ones into demo/assets/thumbs, which are committed
#
# The frames are Apple's footage. They stay on your machine and in the package
# you install on your own TV; preload/ is gitignored and must never be committed.

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/preload"

urls() { grep -oP '"url":\s*"\K[^"]+' "$DIR/js/catalog.js"; }
thumb() { basename "$1" | sed -E 's/\.(mov|mp4)$/.webp/'; }

if [ "${1:-}" = "--list" ]; then
  urls | while read -r url; do thumb "$url"; done
  exit 0
fi

WIDTH=1920
HEIGHT=1080
if [ "${1:-}" = "--demo" ]; then
  OUT="$DIR/demo/assets/thumbs"
  WIDTH=960
  HEIGHT=540
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
mkdir -p "$OUT"

made=0
failed=0
while read -r url; do
  file="$OUT/$(thumb "$url")"
  [ -s "$file" ] && continue
  if ffmpeg -v error -y -ss 1 -i "$url" -frames:v 1 -vf scale=$WIDTH:$HEIGHT -c:v libwebp -quality 75 "$file" </dev/null; then
    made=$((made + 1))
  else
    rm -f "$file"
    failed=$((failed + 1))
    echo "no thumbnail for $url" >&2
  fi
done < <(urls)

echo "cut $made, failed $failed"
[ "$failed" -eq 0 ]
