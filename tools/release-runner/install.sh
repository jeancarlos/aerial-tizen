#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

runner_dir="$HOME/.local/share/aerial-release-runner"
key_path="$HOME/.config/aerial-release/9router.key"
image="aerial-release-runner:2.338.0"
name="aerial-release-runner"

[ -f "$key_path" ] || { echo "Missing $key_path" >&2; exit 1; }
[ "$(stat -c '%u:%a' "$key_path")" = "$(id -u):600" ] || { echo 'The key must be owned by this user with mode 600.' >&2; exit 1; }
python3 - "$key_path" <<'PY'
import json, os, sqlite3, sys
key = open(sys.argv[1], encoding='utf-8').read().strip()
db = sqlite3.connect('file:' + os.path.expanduser('~/.9router/db/data.sqlite') + '?mode=ro', uri=True)
row = db.execute('SELECT isActive, accessRestricted, accessAllow FROM apiKeys WHERE key = ?', (key,)).fetchone()
if not row or row[0] != 1 or row[1] != 1 or json.loads(row[2] or '[]') != ['ag/gemini-3.8-flash-low']:
    sys.exit('The key must be active and restricted to ag/gemini-3.8-flash-low.')
PY
if docker container inspect "$name" >/dev/null 2>&1; then
  echo "Container $name already exists; leaving it unchanged." >&2
  exit 1
fi
mkdir -p "$runner_dir"
docker build -t "$image" "$(dirname "$0")"
umask 077
registration="$(mktemp "$runner_dir/.registration.XXXXXX")"
trap ': > "$registration"' EXIT
gh api --method POST repos/jeancarlos/aerial-tizen/actions/runners/registration-token --jq .token > "$registration"
docker run -d --name "$name" --restart unless-stopped --init \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --memory 2g \
  --add-host host.docker.internal:host-gateway \
  --mount "type=bind,src=$key_path,dst=/home/node/.config/aerial-release/9router.key,readonly" \
  --mount "type=bind,src=$registration,dst=/run/secrets/runner-registration,readonly" \
  "$image" >/dev/null
timeout 60 python3 - "$name" <<'PY'
import subprocess, sys
process = subprocess.Popen(['docker', 'logs', '--follow', sys.argv[1]], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
try:
    for line in process.stdout:
        if 'Listening for Jobs' in line:
            print('Runner is listening for jobs.')
            break
    else:
        sys.exit('Runner stopped before it was ready; inspect its logs.')
finally:
    process.terminate()
    process.wait(timeout=5)
PY
echo 'Runner registered; enable the release-summary variable only after reviewing the workflow.'
