#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Merge an approved develop-to-main PR and explicitly dispatch its release.
set -euo pipefail

pr="${1:?pull request number required}"
sha="${2:?head commit SHA required}"
: "${GH_REPO:?GH_REPO is required}"
: "${CODEOWNER_LOGIN:?CODEOWNER_LOGIN is required}"
: "${BASE_VERSION:?BASE_VERSION is required}"

[[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "invalid pull request number" >&2; exit 2; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid pull request head SHA" >&2; exit 2; }

pr_data() {
  gh pr view "$pr" --repo "$GH_REPO" --json state,baseRefName,headRefName,headRefOid,mergeCommit \
    --jq '{state,baseRefName,headRefName,headRefOid,mergeSha:.mergeCommit.oid}'
}

review_state() {
  local reviews
  reviews="$(gh api "repos/$GH_REPO/pulls/$pr/reviews?per_page=100" --paginate --slurp)"
  jq -r --arg login "$CODEOWNER_LOGIN" --arg sha "$sha" \
    '[.[][] | select(.user.login == $login and .commit_id == $sha and .state != "COMMENTED")] | sort_by(.submitted_at) | last | .state // ""' \
    <<< "$reviews"
}

version_at() {
  local ref="$1" config package lock
  config="$(gh api "repos/$GH_REPO/contents/config.xml?ref=$ref" --jq '.content | @base64d')"
  package="$(gh api "repos/$GH_REPO/contents/package.json?ref=$ref" --jq '.content | @base64d')"
  lock="$(gh api "repos/$GH_REPO/contents/package-lock.json?ref=$ref" --jq '.content | @base64d')"
  node -e '
    const [config, packageText, lockText] = process.argv.slice(1);
    const widget = config.match(/<widget\b[^>]*\bversion="([^"]+)"/);
    const pkg = JSON.parse(packageText);
    const lock = JSON.parse(lockText);
    const versions = [widget && widget[1], pkg.version, lock.version, lock.packages && lock.packages[""] && lock.packages[""].version];
    if (versions.some(version => !version) || !versions.every(version => version === versions[0]) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versions[0])) process.exit(1);
    process.stdout.write(versions[0]);
  ' "$config" "$package" "$lock"
}

next_patch() {
  node -e 'const match = process.argv[1].match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/); if (!match) process.exit(1); process.stdout.write(`${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`)' "$1"
}

data="$(pr_data)"
state="$(jq -r .state <<< "$data")"
base="$(jq -r .baseRefName <<< "$data")"
head="$(jq -r .headRefName <<< "$data")"
head_sha="$(jq -r .headRefOid <<< "$data")"
[ "$base" = main ] && [ "$head" = develop ] || { echo "PR #$pr is not develop to main" >&2; exit 1; }
[ "$head_sha" = "$sha" ] || { echo "PR #$pr head has moved"; exit 0; }

if [ "$state" = OPEN ]; then
  expected_version="$(next_patch "$BASE_VERSION")"
  head_version="$(version_at "$sha")"
  [ "$head_version" = "$expected_version" ] || {
    echo "promotion version $head_version is not the next patch after main $BASE_VERSION" >&2
    exit 1
  }

  for name in test reuse zizmor dco; do
    result="$(gh api "repos/$GH_REPO/commits/$sha/check-runs?filter=latest&per_page=100" --jq "[.check_runs[] | select(.name == \"$name\")] | {total:length,success:([.[] | select(.conclusion == \"success\")] | length)}")"
    total="$(jq -r .total <<< "$result")"
    success="$(jq -r .success <<< "$result")"
    if [ "$success" -eq 0 ]; then
      if [ "$name" = dco ] && [ "$total" -eq 0 ]; then
        main_sha="$(gh api "repos/$GH_REPO/git/ref/heads/main" --jq .object.sha)"
        [[ "$main_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid main SHA for DCO validation" >&2; exit 1; }
        gh workflow run dco.yml --ref develop --repo "$GH_REPO" --field base="$main_sha"
      fi
      echo "promotion PR #$pr is waiting for $name on $sha"
      exit 0
    fi
  done

  if [ "$(review_state)" != APPROVED ]; then
    echo "promotion PR #$pr is waiting for code-owner approval on $sha"
    exit 0
  fi

  changelog_dir="$(mktemp -d)"
  trap 'rm -rf "$changelog_dir"' EXIT
  gh api "repos/$GH_REPO/contents/CHANGELOG.md?ref=$sha" --jq '.content | @base64d' > "$changelog_dir/CHANGELOG.md"
  printf '{"version":"%s"}\n' "$head_version" > "$changelog_dir/package.json"
  cp "$changelog_dir/CHANGELOG.md" "$changelog_dir/CHANGELOG.before.md"
  node "$(dirname "${BASH_SOURCE[0]}")/refresh-promotion-changelog.js" "$changelog_dir" >/dev/null
  if ! cmp -s "$changelog_dir/CHANGELOG.before.md" "$changelog_dir/CHANGELOG.md"; then
    echo "promotion PR #$pr is waiting for release-note refresh on $sha"
    exit 0
  fi
  gh pr merge "$pr" --repo "$GH_REPO" --merge --match-head-commit "$sha"
  data="$(pr_data)"
  state="$(jq -r .state <<< "$data")"
fi

if [ "$state" != MERGED ]; then
  echo "promotion PR #$pr is $state; no release dispatched"
  exit 0
fi

review_state="$(review_state)"
[ "$review_state" = APPROVED ] || { echo "merged promotion lacks code-owner approval on $sha" >&2; exit 1; }
merge_sha="$(jq -r .mergeSha <<< "$data")"
[[ "$merge_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "promotion PR #$pr has no merge commit SHA" >&2; exit 1; }
gh workflow run promote.yml --ref main --repo "$GH_REPO" --field pull_request="$pr" --field merge_sha="$merge_sha"
