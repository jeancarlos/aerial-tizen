#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/.config/aerial-release" "$test_dir/.9router/db" "$test_dir/bin"
printf 'example-key' > "$test_dir/.config/aerial-release/9router.key"
chmod 600 "$test_dir/.config/aerial-release/9router.key"
cat > "$test_dir/bin/docker" <<'SCRIPT'
#!/bin/sh
touch "$HOME/docker-was-run"
exit 1
SCRIPT
chmod +x "$test_dir/bin/docker"
python3 - "$test_dir/.9router/db/data.sqlite" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('CREATE TABLE apiKeys (key TEXT, isActive INTEGER, accessRestricted INTEGER, accessAllow TEXT)')
db.execute('INSERT INTO apiKeys VALUES (?, ?, ?, ?)', ('example-key', 1, 0, '[]'))
db.commit()
PY
if HOME="$test_dir" PATH="$test_dir/bin:$PATH" bash "$root/tools/release-runner/install.sh" >/dev/null 2>&1; then
  echo 'unrestricted key was accepted' >&2
  exit 1
fi
[ ! -e "$test_dir/docker-was-run" ] || { echo 'docker ran before key validation' >&2; exit 1; }
python3 - "$test_dir/.9router/db/data.sqlite" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('UPDATE apiKeys SET accessRestricted = 1, accessAllow = ?', ('["ag/other-model"]',))
db.commit()
PY
if HOME="$test_dir" PATH="$test_dir/bin:$PATH" bash "$root/tools/release-runner/install.sh" >/dev/null 2>&1; then
  echo 'key for another model was accepted' >&2
  exit 1
fi
[ ! -e "$test_dir/docker-was-run" ] || { echo 'docker ran before model validation' >&2; exit 1; }
python3 - "$test_dir/.9router/db/data.sqlite" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('UPDATE apiKeys SET accessAllow = ?', ('["ag/gemini-3.8-flash-low"]',))
db.commit()
PY
HOME="$test_dir" PATH="$test_dir/bin:$PATH" bash "$root/tools/release-runner/install.sh" >/dev/null 2>&1 || true
[ -e "$test_dir/docker-was-run" ] || { echo 'valid restricted key was refused' >&2; exit 1; }
echo 'release runner key validation tests passed'
