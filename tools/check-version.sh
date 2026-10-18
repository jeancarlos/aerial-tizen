#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Fails unless config.xml, package.json and package-lock.json carry the same
# version, and, when a tag is given, unless the tag is v<that version>.
#
#   bash tools/check-version.sh [v1.2.3]

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

widget=$(grep -oP ' version="\K[0-9]+\.[0-9]+\.[0-9]+' "$DIR/config.xml" | head -1)
package=$(node -p "require('$DIR/package.json').version")
lock=$(node -p "require('$DIR/package-lock.json').version")

if [ "$widget" != "$package" ] || [ "$package" != "$lock" ]; then
  echo "version mismatch: config.xml=$widget package.json=$package package-lock.json=$lock" >&2
  exit 1
fi

if [ -n "${1:-}" ] && [ "$1" != "v$widget" ]; then
  echo "tag $1 does not match version $widget" >&2
  exit 1
fi

echo "version $widget"
