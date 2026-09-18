#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env found. Run ./setup.sh first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

export PATH="$TIZEN_PATH/tools/ide/bin:$TIZEN_PATH/tools:$PATH"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"

APP="AerialScr0.AerialScreensaver"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging runtime files..."
mkdir -p "$STAGE/css" "$STAGE/js"
cp "$DIR/config.xml" "$DIR/icon.png" "$DIR/index.html" "$STAGE/"
cp "$DIR/css/style.css" "$STAGE/css/"
for name in catalog settings player menu main; do
  cp "$DIR/js/$name.js" "$STAGE/js/"
done
cp -r "$DIR/preload" "$STAGE/preload"

echo "==> Packaging..."
tizen package -t wgt -s "$PROFILE" -- "$STAGE"
mv "$STAGE/Aerial Screensaver.wgt" "$STAGE/aerial.wgt"

echo "==> Installing..."
tizen install -n aerial.wgt -t "$TV_NAME" -- "$STAGE"

echo "==> Launching..."
tizen run -p "$APP" -t "$TV_NAME"

echo "==> Done!"
