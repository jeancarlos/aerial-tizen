#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: both deploy scripts say "Nothing installed. <reason>" whenever nothing was installed
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
LISTENER=""
trap 'rm -rf "$TMP"; [ -z "$LISTENER" ] || kill "$LISTENER" 2>/dev/null' EXIT

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1"; echo "$2" | sed 's/^/      /'; }

mkdir -p "$TMP/repo" "$TMP/stubs" "$TMP/real"
(cd "$ROOT" && cp -r config.xml icon.png index.html css js tools tvdeploy.sh deploy.sh "$TMP/repo/")
for tool in bash sh sed awk grep cut head tail tr mktemp rm cp mv mkdir du seq timeout dirname cat printf env sleep ls wc kill; do
  path="$(command -v "$tool" 2>/dev/null || true)"
  [ -z "$path" ] || ln -sf "$path" "$TMP/real/$tool"
done

stub() { printf '#!/bin/bash\n%s\n' "$2" > "$TMP/stubs/$1"; chmod +x "$TMP/stubs/$1"; }
reset_stubs() { rm -f "$TMP/stubs"/*; }
tv() { PATH="$TMP/stubs:$TMP/real" bash "$TMP/repo/tvdeploy.sh" "$@" 2>&1; }

expect() {
  local name="$1" want="$2" out="$3"
  if echo "$out" | grep -qE "$want"; then ok "$name"; else fail "$name (wanted: $want)" "$out"; fi
}
refuse() {
  local name="$1" out="$2"
  if echo "$out" | grep -q "Nothing installed\."; then fail "$name" "$out"; else ok "$name"; fi
}

node -e '
const s = require("net").createServer(c => c.end()).listen(0, "127.0.0.1", () => console.log(s.address().port));
setInterval(() => {}, 1000);' > "$TMP/port" &
LISTENER=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMP/port" ] && break; sleep 0.3; done
PORT="$(cat "$TMP/port")"
export AERIAL_SDB_PORT="$PORT"

echo ""
echo "Deploy checks:"

reset_stubs; stub ip 'exit 1'
expect "tvdeploy: --tv without a value is refused" "Nothing installed\. --tv needs an address" "$(tv --tv)"
expect "tvdeploy: an unknown option is refused" "Nothing installed\. unknown option: --bogus" "$(tv --bogus)"
expect "tvdeploy: a non-IP address is refused, never run as shell" "Nothing installed\. 'x;touch /tmp/pwned' is not an IPv4 address" "$(tv --tv 'x;touch /tmp/pwned')"
expect "tvdeploy: no TV found says nothing was installed" "Nothing installed\. No TV found" "$(tv)"

reset_stubs; stub ip 'echo "1.1.1.1 via 10.0.0.1 dev eth0 src 192.0.2.7"'
expect "tvdeploy: an empty scan says nothing was installed" "Nothing installed\. No TV found" "$(tv)"

reset_stubs
expect "tvdeploy: no docker and no tizen says nothing was installed" "Nothing installed\. Need Docker" "$(tv --tv 127.0.0.1)"

reset_stubs
stub docker 'cat > "$STUB_LOG.script" <<< "$6"; for a in "$@"; do last="$a"; done; printf "%s" "$last" > "$STUB_LOG.script"; exit 1'
export STUB_LOG="$TMP/docker"
out="$(tv --tv 127.0.0.1)"
expect "tvdeploy: a failing deploy says nothing was installed" "Nothing installed\. The deploy failed" "$out"
if echo "$out" | grep -q "Done\. The app is installed"; then fail "tvdeploy: a failing deploy never says Done" "$out"; else ok "tvdeploy: a failing deploy never says Done"; fi
script="$(cat "$STUB_LOG.script")"
expect "tvdeploy: the install script targets the address it was given" "sdb connect 127\.0\.0\.1:$PORT" "$script"
expect "tvdeploy: the install picks the device that matches that address" 'awk -v a="127\.0\.0\.1:'"$PORT"'"' "$script"

reset_stubs; stub docker 'exit 0'
out="$(tv --tv 127.0.0.1)"
expect "tvdeploy: a clean deploy says Done" "Done\. The app is installed on 127\.0\.0\.1" "$out"
refuse "tvdeploy: a clean deploy never says nothing was installed" "$out"

reset_stubs; stub docker 'exit 0'
out="$(tv --tv 127.0.0.1 --package-only)"
expect "tvdeploy: package-only without a wgt says nothing was installed" "Nothing installed\. Packaging produced no aerial\.wgt" "$out"

cat > "$TMP/repo/.env" <<ENV
TIZEN_PATH=$TMP/tizen
TV_NAME=tv
PROFILE=p
ENV
dp() { PATH="$TMP/stubs:$TMP/real" bash "$TMP/repo/deploy.sh" 2>&1; }

reset_stubs
out="$(PATH="$TMP/stubs:$TMP/real" bash -c "mv '$TMP/repo/.env' '$TMP/env.bak'; bash '$TMP/repo/deploy.sh' 2>&1; mv '$TMP/env.bak' '$TMP/repo/.env'")"
expect "deploy: a missing .env says nothing was installed" "Nothing installed\. No \.env found" "$out"

reset_stubs
expect "deploy: a missing tizen CLI says nothing was installed" "Nothing installed\. The tizen CLI was not found" "$(dp)"

reset_stubs; stub tizen 'exit 1'
expect "deploy: a failed package says nothing was installed" "Nothing installed\. Packaging failed" "$(dp)"

reset_stubs; stub tizen 'case "$1" in package) for a in "$@"; do last="$a"; done; : > "$last/Aerial Screensaver.wgt";; install) exit 1;; esac'
expect "deploy: a refused install says nothing was installed" "Nothing installed\. The TV refused the install" "$(dp)"

reset_stubs; stub tizen 'case "$1" in package) for a in "$@"; do last="$a"; done; : > "$last/Aerial Screensaver.wgt";; esac'
out="$(dp)"
expect "deploy: a clean deploy says Done" "Done!" "$out"
refuse "deploy: a clean deploy never says nothing was installed" "$out"

echo ""
if [ "$failed" -eq 0 ]; then
  echo "$((passed + failed)) tests, $passed passed, 0 failed"
else
  echo "$((passed + failed)) tests, $passed passed, $failed failed"
  exit 1
fi
