#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Merge a develop-to-main PR only after its checks and current-head code-owner approval pass.
set -euo pipefail

pr="${1:?pull request number required}"
sha="${2:?head commit SHA required}"
: "${GH_REPO:?GH_REPO is required}"
: "${CODEOWNER_LOGIN:?CODEOWNER_LOGIN is required}"

[[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "invalid pull request number" >&2; exit 2; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid pull request head SHA" >&2; exit 2; }

state="$(gh pr view "$pr" --repo "$GH_REPO" --json state --jq .state)"
if [ "$state" != OPEN ]; then
  echo "promotion PR #$pr is already $state"
  exit 0
fi

for name in test reuse zizmor; do
  count="$(gh api "repos/$GH_REPO/commits/$sha/check-runs?filter=latest&per_page=100" --jq "[.check_runs[] | select(.name == \"$name\" and .conclusion == \"success\")] | length")"
  if [ "$count" -eq 0 ]; then
    echo "promotion PR #$pr is waiting for $name on $sha"
    exit 0
  fi
done

review_state="$(gh api "repos/$GH_REPO/pulls/$pr/reviews" --jq "[.[] | select(.user.login == \"$CODEOWNER_LOGIN\" and .commit_id == \"$sha\")] | sort_by(.submitted_at) | last | .state // \"\"")"
if [ "$review_state" != APPROVED ]; then
  echo "promotion PR #$pr is waiting for code-owner approval on $sha"
  exit 0
fi

gh pr merge "$pr" --repo "$GH_REPO" --merge --match-head-commit "$sha"
