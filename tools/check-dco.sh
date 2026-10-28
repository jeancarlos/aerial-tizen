#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Fails when a commit in BASE..HEAD lacks a Signed-off-by line.
#
#   bash tools/check-dco.sh BASE HEAD
#
# Merge commits and commits by bots are skipped, and so is anything committed
# before DCO_FROM, so history that predates the rule does not fail it.

set -euo pipefail

base="${1:?base}"
head="${2:?head}"
from="${DCO_FROM:-2026-10-17T17:00:00Z}"
cutoff="$(date -u -d "$from" +%s)"
missing=0

git rev-parse --verify --quiet --end-of-options "${base}^{commit}" >/dev/null || {
  echo "invalid DCO base commit: $base" >&2
  exit 2
}
commits="$(git rev-list --no-merges "$base..$head")" || {
  echo "invalid DCO revision range: $base..$head" >&2
  exit 2
}

while read -r sha; do
  [ -n "$sha" ] || continue
  [ "$(git show -s --format=%at "$sha")" -ge "$cutoff" ] || continue
  case "$(git show -s --format=%an "$sha")" in *"[bot]"*) continue ;; esac
  if ! git show -s --format=%B "$sha" | grep -qE '^Signed-off-by: .+ <.+@.+>$'; then
    echo "missing Signed-off-by: $sha $(git show -s --format=%s "$sha")" >&2
    missing=$((missing + 1))
  fi
done <<< "$commits"

[ "$missing" -eq 0 ]
