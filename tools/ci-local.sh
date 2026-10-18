#!/bin/bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -eu
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
cd "$(git rev-parse --show-toplevel)"
echo "ci-local: syntax"
for f in js/*.js demo/*.js test/*.js worker/*.mjs test/*.mjs; do [ -e "$f" ] && node --check "$f"; done
for f in *.sh demo/*.sh test/*.sh tools/*.sh; do [ -e "$f" ] && bash -n "$f"; done
echo "ci-local: lint"
npm run --silent lint
echo "ci-local: tests and coverage gate"
npm run --silent coverage >/dev/null
echo "ci-local: fuzz"
npm run --silent fuzz >/dev/null
echo "ci-local: reuse"
reuse lint -q
