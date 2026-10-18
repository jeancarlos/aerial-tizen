#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -euo pipefail

base="${1:?base}"
head="${2:?head}"
missing=0

while read -r sha; do
  [ -n "$sha" ] || continue
  subject="$(git show -s --format=%s "$sha")"
  [[ "$subject" =~ ^(feat|fix)(\(.+\))?!?: ]] || continue
  git show -s --format=%b "$sha" | grep -qE '^No-Test:[[:space:]]*[^[:space:]]' && continue
  git show --name-only --format= "$sha" | grep -q '^test/' && continue
  echo "no change under test/: $sha $subject (add a test, or a \"No-Test: <reason>\" line)" >&2
  missing=$((missing + 1))
done < <(git rev-list --no-merges "$base..$head")

[ "$missing" -eq 0 ]
