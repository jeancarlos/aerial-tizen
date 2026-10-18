#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Test: ci-local drops the git hook environment so a linked worktree is not rewritten by the suites
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if grep -qx 'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE' "$ROOT/tools/ci-local.sh"; then
  echo "  ✓ ci-local unsets the git hook environment"
  echo "1 tests, 1 passed, 0 failed"
else
  echo "  ✗ ci-local keeps GIT_DIR from the hook"
  exit 1
fi
