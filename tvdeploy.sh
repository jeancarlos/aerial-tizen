#!/usr/bin/env bash
# One-command deploy to a Samsung Tizen TV.
#
#   ./tvdeploy.sh                 discover the TV, package, install, launch
#   ./tvdeploy.sh --tv 10.0.0.5   skip discovery
#   ./tvdeploy.sh --package-only  build the .wgt and stop
#
# Needs Docker, or a local Tizen Studio CLI on PATH. No Samsung account:
# the TV accepts the Tizen public distributor certificate.
set -uo pipefail

IMAGE="${AERIAL_SDK_IMAGE:-vitalets/tizen-webos-sdk}"
PROFILE="${AERIAL_PROFILE:-dev}"
APP_ID="AerialScr0.AerialScreensaver"
PKG_ID="AerialScr0"
SDB_PORT=26101

DIR="$(cd "$(dirname "$0")" && pwd)"
TV="${AERIAL_TV:-}"
LAUNCH=1
PACKAGE_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tv) TV="${2:-}"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    --package-only) PACKAGE_ONLY=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✗  %s\033[0m\n' "$*" >&2; exit 1; }

# ── Find the TV ───────────────────────────────────────────────────────────────
# A stale address is the most common failure: every command then times out and
# looks like the TV is off, so discovery beats a remembered IP.
discover_tv() {
  local subnet ip
  subnet="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}' | cut -d. -f1-3)"
  [ -n "$subnet" ] || return 1
  say "Scanning ${subnet}.0/24 for a TV with developer mode on"
  for ip in $(seq 1 254); do
    ( timeout 1 bash -c "</dev/tcp/${subnet}.${ip}/${SDB_PORT}" 2>/dev/null && echo "${subnet}.${ip}" ) &
  done > /tmp/aerial-tv-scan.$$ 2>/dev/null
  wait
  head -1 /tmp/aerial-tv-scan.$$ 2>/dev/null
  rm -f /tmp/aerial-tv-scan.$$
}

if [ -z "$TV" ] && [ -f "$DIR/.env" ]; then
  TV="$(grep -oP '^TV_IP=\K.*' "$DIR/.env" 2>/dev/null | tr -d "'\"" | head -1)"
  [ -n "$TV" ] && say "Using TV_IP from .env: $TV"
fi

if [ -n "$TV" ] && ! timeout 3 bash -c "</dev/tcp/${TV}/${SDB_PORT}" 2>/dev/null; then
  warn "$TV is not answering on port $SDB_PORT; falling back to discovery"
  TV=""
fi

if [ -z "$TV" ] && [ "$PACKAGE_ONLY" -eq 0 ]; then
  TV="$(discover_tv)"
  [ -n "$TV" ] || die "No TV found. Enable developer mode (Apps, type 12345), point it at this machine, restart the TV, then pass --tv <ip>."
  say "Found TV at $TV"
fi

# ── Stage only what runs on the TV ────────────────────────────────────────────
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/js" "$STAGE/css"
cp "$DIR/config.xml" "$DIR/icon.png" "$DIR/index.html" "$STAGE/"
cp "$DIR/css/style.css" "$STAGE/css/"
for name in catalog storage telemetry settings player menu debug main; do
  cp "$DIR/js/$name.js" "$STAGE/js/"
done
if [ -f "$DIR/js/local-config.js" ]; then
  cp "$DIR/js/local-config.js" "$STAGE/js/"
else
  warn "no js/local-config.js: shipping public defaults, telemetry off"
fi
cp -r "$DIR/preload" "$STAGE/preload"
say "Staged $(du -sh "$STAGE" | cut -f1) of runtime files"

# ── Build the command that runs the Tizen CLI ─────────────────────────────────
# Signing uses the profile that ships inside the SDK image, so there is no
# certificate to create, store or lose. Because every deploy from the same
# image tag reuses the same author certificate, updates install cleanly; a
# build made with a different certificate is handled by the uninstall retry
# below.
if command -v docker >/dev/null 2>&1; then
  RUNNER=docker
elif command -v tizen >/dev/null 2>&1 && command -v sdb >/dev/null 2>&1; then
  RUNNER=local
  warn "Docker not found; using the local Tizen CLI and its own keystore"
else
  die "Need Docker, or tizen and sdb on PATH."
fi

run_sdk() {
  if [ "$RUNNER" = docker ]; then
    docker run --rm --network=host \
      -v "$STAGE:/stage" \
      "$IMAGE" bash -lc "$1"
  else
    bash -lc "${1//\/stage/$STAGE}"
  fi
}

STEPS='
set -uo pipefail
echo "--> packaging"
tizen package -t wgt -s PROFILE_NAME -- /stage 2>&1 | grep -E "Package File|rror" || true
[ -f "/stage/Aerial Screensaver.wgt" ] || { echo "packaging produced no .wgt; see ~/tizen-studio-data/cli/logs/cli.log"; exit 1; }
mv "/stage/Aerial Screensaver.wgt" /stage/aerial.wgt
'

INSTALL_STEPS='
sdb connect TV_ADDRESS >/dev/null || { echo "sdb could not connect to TV_ADDRESS"; exit 1; }
DEVICE="$(sdb devices | awk "NR>1 && \$1 != \"\" {print \$3; exit}")"
echo "--> device $DEVICE"

OUT="$(tizen install -n aerial.wgt -t "$DEVICE" -- /stage 2>&1)"
echo "$OUT" | tail -4
if echo "$OUT" | grep -q "Author certificate not match"; then
  echo "--> an older build signed with a different certificate is installed; removing it (this clears the app settings)"
  sdb -s TV_ADDRESS uninstall PKG_IDENT >/dev/null 2>&1
  OUT="$(tizen install -n aerial.wgt -t "$DEVICE" -- /stage 2>&1)"
  echo "$OUT" | tail -4
fi
echo "$OUT" | grep -q "Installed the package" || exit 1
LAUNCH_STEP
'

render() {
  printf '%s' "$1" \
    | sed "s/PROFILE_NAME/$PROFILE/g" \
    | sed "s/TV_ADDRESS/${TV}:${SDB_PORT}/g; s/PKG_IDENT/$PKG_ID/g"
}

if [ "$PACKAGE_ONLY" -eq 1 ]; then
  say "Packaging only"
  run_sdk "$(render "$STEPS")" || die "packaging failed"
  cp "$STAGE/aerial.wgt" "$DIR/aerial.wgt" 2>/dev/null || true
  say "Wrote $DIR/aerial.wgt"
  exit 0
fi

if [ "$LAUNCH" -eq 1 ]; then
  LAUNCH_CMD="echo \"--> launching\"; tizen run -p $APP_ID -t \"\$DEVICE\" 2>&1 | tail -2"
else
  LAUNCH_CMD="echo \"--> not launching (--no-launch)\""
fi

FULL="$(render "$STEPS")
$(render "${INSTALL_STEPS/LAUNCH_STEP/$LAUNCH_CMD}")"

say "Deploying to $TV"
if run_sdk "$FULL"; then
  say "Done. The app is installed on $TV."
else
  die "Deploy failed. Re-run with the output above; if it mentions a certificate, the script already tried removing the old build."
fi
