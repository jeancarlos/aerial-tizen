#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
# Dispatch the next merged patch promotion after a release completes.
set -euo pipefail

: "${GH_REPO:?GH_REPO is required}"

next_patch() {
  node -e 'const match = process.argv[1].match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/); if (!match) process.exit(1); process.stdout.write(`${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`)' "$1"
}

latest_tag="$(gh api "repos/$GH_REPO/releases/latest" --jq .tag_name)"
[[ "$latest_tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo "latest release has an invalid tag: $latest_tag" >&2
  exit 1
}
anchor_version="${latest_tag#v}"
if [ -n "${PUBLISHED_TAG:-}" ]; then
  [[ "$PUBLISHED_TAG" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
    echo "completed release has an invalid tag: $PUBLISHED_TAG" >&2
    exit 1
  }
  gh release view "$PUBLISHED_TAG" --repo "$GH_REPO" >/dev/null
  published_version="${PUBLISHED_TAG#v}"
  anchor_version="$(node -e '
  const parse = value => value.split(".").map(BigInt);
  const [latest, published] = process.argv.slice(1).map(parse);
  for (let i = 0; i < 3; i++) {
    if (latest[i] > published[i]) { process.stdout.write(process.argv[1]); process.exit(0); }
    if (published[i] > latest[i]) { process.stdout.write(process.argv[2]); process.exit(0); }
  }
  process.stdout.write(process.argv[1]);
  ' "$anchor_version" "$published_version")"
fi
expected_version="$(next_patch "$anchor_version")"
pull_requests="$(gh pr list --repo "$GH_REPO" --state merged --base main --head develop --limit 1000 --json number,mergeCommit)"

while IFS=$'\t' read -r pr merge_sha; do
  [[ "$pr" =~ ^[1-9][0-9]*$ && "$merge_sha" =~ ^[0-9a-f]{40}$ ]] || continue
  if ! package_json="$(gh api "repos/$GH_REPO/contents/package.json?ref=$merge_sha" --jq '.content | gsub("\\s"; "") | @base64d')"; then
    if jq -e '.status == "404"' <<< "$package_json" >/dev/null 2>&1; then continue; fi
    echo "failed to read package.json for promotion PR #$pr" >&2
    exit 1
  fi
  version="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).version || "")' <<< "$package_json")"
  if [ "$version" = "$expected_version" ]; then
    gh workflow run promote.yml --ref main --repo "$GH_REPO" --field pull_request="$pr" --field merge_sha="$merge_sha" --field released_tag="v$anchor_version"
    echo "resumed queued promotion PR #$pr for v$version"
    exit 0
  fi
done < <(jq -r '.[] | select(.mergeCommit.oid != null) | [.number, .mergeCommit.oid] | @tsv' <<< "$pull_requests")

echo "no merged promotion for queued version $expected_version"
