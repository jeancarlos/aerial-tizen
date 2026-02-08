#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

# Load existing .env if present
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

echo "=== Aerial Screensaver - Setup ==="
echo ""

# Tizen Studio path first (needed for sdb)
read -p "Tizen Studio path [${TIZEN_PATH:-/home/$USER/tizen-studio}]: " input
TIZEN_PATH="${input:-${TIZEN_PATH:-/home/$USER/tizen-studio}}"

export PATH="$TIZEN_PATH/tools/ide/bin:$TIZEN_PATH/tools:$PATH"

# Connect to TV
echo ""
read -p "TV IP address [${TV_IP:-}]: " input
TV_IP="${input:-$TV_IP}"

if [ -z "$TV_IP" ]; then
  echo "Error: TV IP is required."
  exit 1
fi

echo ""
echo "Connecting to $TV_IP..."
sdb connect "$TV_IP":26101 2>&1

echo ""
echo "Available devices:"
sdb devices 2>/dev/null | tail -n +2
echo ""
read -p "TV name [${TV_NAME:-}]: " input
TV_NAME="${input:-$TV_NAME}"

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
elif [ -n "$DUID" ]; then
  echo "Using saved DUID: $DUID"
else
  read -p "Enter DUID manually: " DUID
fi

# Tizen Studio data path
read -p "Tizen Studio data path [${TIZEN_DATA:-/home/$USER/tizen-studio-data}]: " input
TIZEN_DATA="${input:-${TIZEN_DATA:-/home/$USER/tizen-studio-data}}"

# Security profile
read -p "Security profile name [${PROFILE:-AerialProfile}]: " input
PROFILE="${input:-${PROFILE:-AerialProfile}}"

# Write .env
cat > "$ENV_FILE" <<EOF
TV_IP=$TV_IP
TV_NAME=$TV_NAME
DUID=$DUID
TIZEN_PATH=$TIZEN_PATH
TIZEN_DATA=$TIZEN_DATA
PROFILE=$PROFILE
EOF

echo ""
echo "Saved to .env:"
echo ""
cat "$ENV_FILE"
