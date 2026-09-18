#!/bin/bash
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

# Load existing .env if present
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

echo "=== Aerial Screensaver - Setup ==="
echo ""

# Tizen Studio path first (needed for sdb)
read -rp "Tizen Studio path [${TIZEN_PATH:-/home/$USER/tizen-studio}]: " input
TIZEN_PATH="${input:-${TIZEN_PATH:-/home/$USER/tizen-studio}}"

export PATH="$TIZEN_PATH/tools/ide/bin:$TIZEN_PATH/tools:$PATH"

# Connect to TV
echo ""
read -rp "TV IP address [${TV_IP:-}]: " input
TV_IP="${input:-${TV_IP:-}}"

if [ -z "$TV_IP" ]; then
  echo "Error: TV IP is required."
  exit 1
fi

echo ""
echo "Connecting to $TV_IP..."
if ! CONNECT_OUTPUT=$(sdb connect "$TV_IP":26101 2>&1) ||
   ! grep -Eq '^(already )?connected to ' <<< "$CONNECT_OUTPUT"; then
  printf '%s\n' "$CONNECT_OUTPUT" >&2
  echo "Error: sdb could not connect to $TV_IP:26101. Is the TV on with developer mode enabled?" >&2
  exit 1
fi

echo ""
echo "Available devices:"
sdb devices 2>/dev/null | tail -n +2
echo ""
read -rp "TV name [${TV_NAME:-}]: " input
TV_NAME="${input:-${TV_NAME:-}}"

if [ -z "$TV_NAME" ]; then
  echo "Error: TV name is required."
  exit 1
fi

# DUID
echo ""
echo "Getting DUID from TV..."
DETECTED_DUID=$(sdb -s "$TV_NAME" shell 0 getduid 2>/dev/null | tr -d '[:space:]')

if [ -n "$DETECTED_DUID" ]; then
  DUID="$DETECTED_DUID"
  echo "DUID: $DUID"
elif [ -n "${DUID:-}" ]; then
  echo "Using saved DUID: $DUID"
else
  read -rp "Enter DUID manually: " DUID
fi

# Tizen Studio data path
read -rp "Tizen Studio data path [${TIZEN_DATA:-/home/$USER/tizen-studio-data}]: " input
TIZEN_DATA="${input:-${TIZEN_DATA:-/home/$USER/tizen-studio-data}}"

# Security profile
read -rp "Security profile name [${PROFILE:-AerialProfile}]: " input
PROFILE="${input:-${PROFILE:-AerialProfile}}"

# Write .env
{
  printf 'TV_IP=%q\n' "$TV_IP"
  printf 'TV_NAME=%q\n' "$TV_NAME"
  printf 'DUID=%q\n' "$DUID"
  printf 'TIZEN_PATH=%q\n' "$TIZEN_PATH"
  printf 'TIZEN_DATA=%q\n' "$TIZEN_DATA"
  printf 'PROFILE=%q\n' "$PROFILE"
} > "$ENV_FILE"

echo ""
echo "Saved to .env:"
echo ""
cat "$ENV_FILE"
