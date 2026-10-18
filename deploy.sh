#!/bin/bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

nothing() { printf 'Nothing installed. %s\n' "$*" >&2; exit 1; }
trap 'printf "Nothing installed. %s failed at line %s.\n" "$BASH_COMMAND" "$LINENO" >&2' ERR

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

[ -f "$ENV_FILE" ] || nothing "No .env found. Run ./setup.sh first."

# shellcheck source=/dev/null
source "$ENV_FILE"

[ -n "${TIZEN_PATH:-}" ] || nothing "TIZEN_PATH is not set in .env. Run ./setup.sh."
[ -n "${TV_NAME:-}" ] || nothing "TV_NAME is not set in .env. Run ./setup.sh."
[ -n "${PROFILE:-}" ] || nothing "PROFILE is not set in .env. Run ./setup.sh."

export PATH="$TIZEN_PATH/tools/ide/bin:$TIZEN_PATH/tools:$PATH"
command -v tizen >/dev/null 2>&1 || nothing "The tizen CLI was not found under $TIZEN_PATH."
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"

APP="AerialScr0.AerialScreensaver"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging runtime files..."
mkdir -p "$STAGE/css" "$STAGE/js"
cp "$DIR/config.xml" "$DIR/icon.png" "$DIR/index.html" "$STAGE/"
cp "$DIR/css/style.css" "$STAGE/css/"
for name in catalog storage telemetry settings player menu debug main; do
  cp "$DIR/js/$name.js" "$STAGE/js/"
done
if [ -f "$DIR/js/local-config.js" ]; then
  cp "$DIR/js/local-config.js" "$STAGE/js/"
else
  echo "(no js/local-config.js: shipping public defaults, telemetry off)"
fi
mkdir -p "$DIR/preload"
bash "$DIR/tools/make-thumbs.sh" || echo "(some thumbnails are missing: those transitions fade instead)"
cp -r "$DIR/preload" "$STAGE/preload"

echo "==> Packaging..."
tizen package -t wgt -s "$PROFILE" -- "$STAGE" || nothing "Packaging failed."
[ -f "$STAGE/Aerial Screensaver.wgt" ] || nothing "Packaging produced no .wgt."
mv "$STAGE/Aerial Screensaver.wgt" "$STAGE/aerial.wgt"

echo "==> Installing..."
tizen install -n aerial.wgt -t "$TV_NAME" -- "$STAGE" || nothing "The TV refused the install."

echo "==> Launching..."
tizen run -p "$APP" -t "$TV_NAME" || echo "(installed, but launching failed: open the app from the TV's Apps list)"

echo "==> Done!"
