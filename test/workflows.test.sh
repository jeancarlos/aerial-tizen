#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fails=0
check() { if "${@:2}"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails+1)); fi; }
has() { grep -qF -- "$2" "$ROOT/.github/workflows/$1"; }
check "dependabot-merge selects the PR from the run" has dependabot-merge.yml 'pull_requests[0].number'
check "dependabot-merge verifies the author" has dependabot-merge.yml 'app/dependabot develop false'
check "dependabot-merge dispatches security" has dependabot-merge.yml 'gh workflow run security.yml --ref develop'
check "promote listens for required workflow completions" has promote.yml 'workflows: [ci, security, dco]'
check "promote waits for every required check" has promote.yml 'for name in "$@"; do'
check "promote requires CI and security checks before main promotion" has promote.yml 'check_required "$SHA" test reuse zizmor'
check "promote checks DCO before merging a version bump" has promote.yml 'check_required "$SHA" test reuse zizmor dco'
check "promote computes numeric patch versions" has promote.yml 'match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)'
check "promote derives the bump branch from the verified develop head" has promote.yml 'bump_branch="release-bump/v$next_version-${SHA:0:7}"'
check "promote fetches release-bump commits before validating them" has promote.yml 'git fetch origin "refs/heads/$HEAD_BRANCH:refs/remotes/origin/$HEAD_BRANCH"'
check "promote validates a bump branch against its develop parent" has promote.yml 'bump_parent="$(git rev-parse "$SHA^")"'
check "promote requires one bump commit directly on current develop" has promote.yml 'if [ "$bump_parent" != "$develop_sha" ] || [ "$(git rev-list --count "$develop_sha..$SHA")" -ne 1 ]; then'
check "promote skips duplicate runs after the bump PR merges" has promote.yml 'version-bump PR is already closed or merged'
check "promote restricts bump PR changes to release metadata" has promote.yml 'expected_files="$(printf '\''%s\n'\'' CHANGELOG.md config.xml package-lock.json package.json)"'
check "promote verifies the generated bump with the release helper" has promote.yml 'node "$RUNNER_TEMP/prepare-promotion-release.js" "$expected_dir" "$release_date"'
check "promote opens a version bump PR to develop" has promote.yml 'gh pr create --base develop --head "$bump_branch"'
check "promote dispatches CI on the version bump branch" has promote.yml 'gh workflow run ci.yml --ref "$bump_branch" --repo "$GH_REPO"'
check "promote dispatches security on the version bump branch" has promote.yml 'gh workflow run security.yml --ref "$bump_branch" --repo "$GH_REPO"'
check "promote dispatches scoped DCO on the version bump branch" has promote.yml 'gh workflow run dco.yml --ref "$bump_branch" --repo "$GH_REPO" --field base="$SHA"'
check "promote merges version bump at the verified head" has promote.yml 'gh pr merge "$pr" --merge --match-head-commit "$SHA"'
check "promote dispatches CI after the protected develop merge" has promote.yml 'gh workflow run ci.yml --ref develop --repo "$GH_REPO"'
check "promote dispatches security after the protected develop merge" has promote.yml 'gh workflow run security.yml --ref develop --repo "$GH_REPO"'
check "promote dispatches scoped DCO after the protected develop merge" has promote.yml 'gh workflow run dco.yml --ref develop --repo "$GH_REPO" --field base="$base"'
check "promote creates the version tag at the merge commit" has promote.yml 'ref="refs/tags/$tag" -f sha="$merge_sha"'
check "promote dispatches release on the version tag" has promote.yml 'gh workflow run release.yml --ref "$tag" --repo "$GH_REPO"'
check "promote does not push to protected develop" bash -c "! grep -q 'git push origin .*develop' '$ROOT/.github/workflows/promote.yml'"
check "promote serializes runs per branch" has promote.yml 'cancel-in-progress: false'
check "promote ignores stale workflow runs" has promote.yml 'if [ "$latest_sha" != "$SHA" ]; then'
check "promote requires commits ahead of main" has promote.yml 'if [ "$ahead_by" -eq 0 ]; then'
check "promote requires the next patch release version" has promote.yml 'if [ "$develop_version" != "$expected_version" ]; then'
check "dco supports manual validation for automation branches" grep -q '^  workflow_dispatch:' "$ROOT/.github/workflows/dco.yml"
check "dco dispatch scopes its commit range" grep -q 'inputs.base' "$ROOT/.github/workflows/dco.yml"
check "readme explains automatic patch releases" grep -q 'patch release' "$ROOT/README.md"
check "code owner is the maintainer" grep -qx '\* @jeancarlos' "$ROOT/.github/CODEOWNERS"
check "ci uploads the coverage percent" has ci.yml 'name: coverage-percent'
check "badge publishes to the badges branch" has badge.yml 'HEAD:badges'
check "badge only runs after ci on main" has badge.yml 'branches: [main]'
check "c8 writes the json summary" grep -q json-summary "$ROOT/.c8rc.json"
check "zizmor ignores the badge trigger" grep -qF "badge.yml:5" "$ROOT/.github/zizmor.yml"
check "ci runs the linter" has ci.yml 'npm run lint'
check "lint script exists" grep -q '"lint": "eslint .' "$ROOT/package.json"
check "release pins the signing identity" has release.yml 'workflows/release.yml@${REF}'
check "release no longer accepts any workflow" bash -c "! grep -q certificate-identity-regexp '$ROOT/.github/workflows/release.yml'"
check "pull request workflows skip PRs into main" bash -c "for f in '$ROOT'/.github/workflows/*.yml; do grep -q '^  pull_request:' \$f && ! grep -A1 '^  pull_request:' \$f | grep -q 'branches: \[develop\]' && exit 1; done; exit 0"
exit "$fails"
