#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Prints the release notes of a tag: its CHANGELOG.md section and the upgrade impact. Fails without a section.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
version="${1#v}"

body="$(awk -v v="$version" '
  /^## / { if (on) exit; on = ($2 == v) ; next }
  on { print }
' "$ROOT/CHANGELOG.md" | sed -e '/./,$!d')"

if [ -z "$body" ]; then
  echo "CHANGELOG.md has no section for $version" >&2
  exit 1
fi

printf '%s\n\nUpgrade: run ./deploy.sh from this release to install over the old one. Your settings are kept while you sign with the same author certificate; a different certificate fails with "Author certificate not match" and needs an uninstall first, which clears the settings (see README).\n' "$body"
