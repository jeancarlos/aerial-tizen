#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fails=0
check() { if "${@:2}"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails+1)); fi; }
has() { grep -qF -- "$2" "$ROOT/.github/workflows/$1"; }
has_tool() { grep -qF -- "$2" "$ROOT/tools/$1"; }
check "dependabot-merge selects the PR from the run" has dependabot-merge.yml 'pull_requests[0].number'
check "dependabot-merge verifies the author" has dependabot-merge.yml 'app/dependabot develop false'
check "dependabot merge captures develop before merging" has dependabot-merge.yml 'git/ref/heads/develop'
check "dependabot-merge dispatches security" has dependabot-merge.yml 'gh workflow run security.yml --ref develop'
check "dependabot-merge dispatches scoped DCO" has dependabot-merge.yml 'gh workflow run dco.yml --ref develop --repo "$GH_REPO" --field base="$base"'
check "promote listens for required workflow completions" has promote.yml 'workflows: [ci, security, dco]'
check "promote waits for every required check" has promote.yml 'for name in "$@"; do'
check "workflow-run promotion token can read check runs" bash -c "sed -n '/^  promote:/,/^  merge-approved-promotion:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'checks: read'"
check "review continuation token can read check runs" bash -c "sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'checks: read'"
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
check "promote resumes after a code-owner review" has promote.yml 'pull_request_review:'
check "promote checks code-owner identity and reviewed commit" bash -c "grep -qF CODEOWNER_LOGIN '$ROOT/tools/merge-promotion-pr.sh' && grep -qF 'commit_id ==' '$ROOT/tools/merge-promotion-pr.sh'"
check "promote merges only after approval and passing checks" has promote.yml 'BASE_VERSION="$(node -p'
check "review events can resume the protected main promotion" has promote.yml 'BASE_VERSION="$(node -p'
check "workflow-run promotion supplies the code-owner identity" bash -c "sed -n '/^  promote:/,/^  merge-approved-promotion:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'CODEOWNER_LOGIN: jeancarlos'"
check "approval continuation can merge and dispatch" bash -c "sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'contents: write' && sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'actions: write'"
check "promotion release accepts PR and merge SHA inputs" has promote.yml 'merge_sha:'
check "promotion helper explicitly dispatches the trusted release continuation" has_tool merge-promotion-pr.sh 'gh workflow run promote.yml --ref main --repo "$GH_REPO" --field pull_request="$pr" --field merge_sha="$merge_sha"'
check "promote release continuation runs only from main dispatch" has promote.yml "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"
check "promote release verifies the merged PR and its code-owner approval" bash -c "grep -qF 'PR_NUMBER: \${{ inputs.pull_request }}' '$ROOT/.github/workflows/promote.yml' && grep -qF 'CODEOWNER_LOGIN: jeancarlos' '$ROOT/.github/workflows/promote.yml' && grep -qF 'pulls/\$PR_NUMBER/reviews' '$ROOT/.github/workflows/promote.yml' && grep -qF 'HEAD_SHA=' '$ROOT/.github/workflows/promote.yml' && grep -qF 'headRefOid' '$ROOT/.github/workflows/promote.yml'"
check "promotion review lookup paginates and ignores comments" bash -c "grep -qF -- '--paginate --slurp' '$ROOT/tools/merge-promotion-pr.sh' && grep -qF 'state != \"COMMENTED\"' '$ROOT/tools/merge-promotion-pr.sh' && grep -qF -- '--paginate --slurp' '$ROOT/.github/workflows/promote.yml' && grep -qF 'state != \"COMMENTED\"' '$ROOT/.github/workflows/promote.yml'"
check "promote release tags the recorded merge commit" has promote.yml 'ref="refs/tags/$tag" -f sha="$merge_sha"'
check "promote validates release metadata as data from the merge commit" has promote.yml 'const config = fs.readFileSync("config.xml", "utf8")'
check "promote release does not execute scripts from the merged commit" bash -c "! grep -q 'bash tools/check-version.sh' '$ROOT/.github/workflows/promote.yml'"
check "promote dispatches release on the version tag" has promote.yml 'gh workflow run release.yml --ref "$tag" --repo "$GH_REPO"'
check "promote release retry runs even when main already contains develop" has promote.yml 'name: publish promotion release'
check "promote release verifies a pre-existing tag before skipping" has promote.yml '[ "$tag_sha" = "$merge_sha" ]'
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
check "application pull request workflows skip PRs into main" bash -c "for f in '$ROOT'/.github/workflows/*.yml; do [ \"\$f\" = '$ROOT/.github/workflows/promote.yml' ] && continue; grep -q '^  pull_request:' \$f && ! grep -A1 '^  pull_request:' \$f | grep -q 'branches: \[develop\]' && exit 1; done; exit 0"
exit "$fails"
