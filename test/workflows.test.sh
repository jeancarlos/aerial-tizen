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
check "promote concurrency separates main completions by workflow and commit" has promote.yml "format('main-{0}-{1}', github.event.workflow_run.name, github.event.workflow_run.head_sha)"
check "promote waits for every required check" has promote.yml 'for name in "$@"; do'
check "workflow-run promotion token can read check runs" bash -c "sed -n '/^  promote:/,/^  merge-approved-promotion:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'checks: read'"
check "review continuation token can read check runs" bash -c "sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'checks: read'"
check "promote requires CI and security checks before main promotion" has promote.yml 'check_required "$SHA" test reuse zizmor'
check "promote checks DCO before merging a version bump" has promote.yml 'check_required "$SHA" test reuse zizmor dco'
check "promotion helper requires DCO on the exact release head" has_tool merge-promotion-pr.sh 'for name in test reuse zizmor dco; do'
check "promotion helper dispatches missing DCO" has_tool merge-promotion-pr.sh 'gh workflow run dco.yml --ref develop --repo "$GH_REPO" --field base="$main_sha"'
check "release continuation requires DCO on the merged head" has promote.yml 'select(.name == "dco" and .conclusion == "success")'
check "promote computes numeric patch versions" has promote.yml 'match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)'
check "promote derives the bump branch from the verified develop head" has promote.yml 'bump_branch="release-bump/v$next_version-${SHA:0:7}"'
check "promote fetches open release-bump commits before validating them" has promote.yml 'git fetch origin "refs/heads/$HEAD_BRANCH:refs/remotes/origin/$HEAD_BRANCH"'
check "promote recovers merged bump PRs before fetching deleted branches" awk 'index($0, "if [ \"$pr_state\" = MERGED ]") { merged = NR } index($0, "git fetch origin \"refs/heads/$HEAD_BRANCH") { fetch = NR } END { exit !(merged && fetch && merged < fetch) }' "$ROOT/.github/workflows/promote.yml"
check "promote validates a bump branch against its develop parent" has promote.yml 'bump_parent="$(git rev-parse "$SHA^")"'
check "promote requires one bump commit directly on current develop" has promote.yml 'if [ "$bump_parent" != "$develop_sha" ] || [ "$(git rev-list --count "$develop_sha..$SHA")" -ne 1 ]; then'
check "promote resumes develop checks after the bump PR merges" has promote.yml 'ensure_develop_checks "$develop_sha" "$main_sha"'
check "promote restricts bump PR changes to release metadata" has promote.yml 'expected_files="$(printf '\''%s\n'\'' CHANGELOG.md config.xml package-lock.json package.json)"'
check "promote verifies the generated bump with the release helper" has promote.yml 'node "$RUNNER_TEMP/prepare-promotion-release.js" "$expected_dir" "$release_date"'
check "promote opens a version bump PR to develop" has promote.yml 'gh pr create --base develop --head "$bump_branch"'
check "promote dispatches CI on the version bump branch" has promote.yml 'ensure_workflow_run ci.yml "$bump_sha" "$bump_branch" "" workflow_dispatch'
check "promote dispatches security on the version bump branch" has promote.yml 'ensure_workflow_run security.yml "$bump_sha" "$bump_branch" "" workflow_dispatch'
check "promote dispatches scoped DCO on the version bump branch" has promote.yml 'ensure_workflow_run dco.yml "$bump_sha" "$bump_branch" "$SHA" workflow_dispatch'
check "promote merges version bump at the verified head" has promote.yml 'gh pr merge "$pr" --merge --match-head-commit "$SHA"'
check "promote dispatches CI after the protected develop merge" has promote.yml 'ensure_workflow_run ci.yml "$sha" develop "" ""'
check "promote dispatches security after the protected develop merge" has promote.yml 'ensure_workflow_run security.yml "$sha" develop "" ""'
check "promote dispatches scoped DCO after the protected develop merge" has promote.yml 'ensure_workflow_run dco.yml "$sha" develop "$base" ""'
check "promote resumes after a code-owner review" has promote.yml 'pull_request_review:'
check "promote checks code-owner identity and reviewed commit" bash -c "grep -qF CODEOWNER_LOGIN '$ROOT/tools/merge-promotion-pr.sh' && grep -qF 'commit_id ==' '$ROOT/tools/merge-promotion-pr.sh'"
check "promote merges only after approval and passing checks" has promote.yml 'BASE_VERSION="$(node -p'
check "review events can resume the protected main promotion" has promote.yml 'BASE_VERSION="$(node -p'
check "workflow-run promotion supplies the code-owner identity" bash -c "sed -n '/^  promote:/,/^  merge-approved-promotion:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'CODEOWNER_LOGIN: jeancarlos'"
check "approval continuation can merge and dispatch" bash -c "sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'contents: write' && sed -n '/^  merge-approved-promotion:/,/^  publish-promotion-release:/p' '$ROOT/.github/workflows/promote.yml' | grep -q 'actions: write'"
check "promotion release accepts PR and merge SHA inputs" has promote.yml 'merge_sha:'
check "bootstrap accepts a merged source PR" has promote.yml 'source_pull_request:'
check "queued promotion carries the release it follows" has promote.yml 'RELEASED_TAG: ${{ inputs.released_tag }}'
check "queued promotion verifies that its release anchor exists" has promote.yml 'gh release view "$released_tag" --repo "$GH_REPO"'
check "bootstrap matches the source PR merge to the promotion head" has promote.yml 'jq -r .mergeSha <<< "$source_pr_data")" = "$HEAD_SHA"'
check "bootstrap reuses approval on the exact source PR head" has promote.yml 'source_review_state" = APPROVED ]'
check "bootstrap can reuse the source PR DCO check" has promote.yml 'commits/$source_head_sha/check-runs?filter=latest'
check "bootstrap cannot override a rejected promotion review" has promote.yml 'promotion PR has an explicit $review_state review'
check "bootstrap fallback is limited to v1.0.3 from v1.0.2" has promote.yml 'source PR bootstrap is only allowed for the initial v1.0.3 promotion'
check "bootstrap permits retry of its validated existing v1.0.3 release" has promote.yml '[ "$latest_version" = 1.0.2 ] || [ "$release_exists" = true ]'
check "source DCO fallback applies only during bootstrap" has promote.yml '[ "$source_bootstrap" = true ]; then'
check "DCO recovery dispatches on a ref for the exact commit" has promote.yml 'gh workflow run dco.yml --ref "$dco_ref"'
check "DCO recovery creates the exact commit ref" has promote.yml 'ref="refs/heads/$dco_ref" -f sha="$HEAD_SHA"'
check "DCO workflow checks a requested exact commit" has dco.yml 'DISPATCH_HEAD: ${{ inputs.head }}'
check "DCO workflow deletes its temporary validation ref" has dco.yml 'git/refs/heads/$REF_NAME'
check "promotion helper explicitly dispatches the trusted release continuation" has_tool merge-promotion-pr.sh 'gh workflow run promote.yml --ref main --repo "$GH_REPO" --field pull_request="$pr" --field merge_sha="$merge_sha"'
check "promote release continuation runs only from main dispatch" has promote.yml "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"
check "promote handles successful main CI runs" has promote.yml '[ "$EVENT" = push ] && [ "$WORKFLOW" = ci ] || exit 0'
check "main promotion recovery runs only after a successful CI push" has promote.yml '[ "$EVENT" = push ] && [ "$WORKFLOW" = ci ] || exit 0'
check "promote recovers a manually merged develop PR from its main CI run" has promote.yml 'commits/$SHA/pulls'
check "promote dispatches missing bump checks on reruns" bash -c "grep -qF 'gh run list' '$ROOT/.github/workflows/promote.yml' && grep -qF 'workflow_dispatch' '$ROOT/.github/workflows/promote.yml' && grep -qF 'ensure_workflow_run ci.yml \"\$bump_sha\"' '$ROOT/.github/workflows/promote.yml'"
check "promote repairs develop checks when the bump PR already merged" has promote.yml 'ensure_develop_checks "$develop_sha"'
check "promote release verifies the merged PR and its code-owner approval" bash -c "grep -qF 'PR_NUMBER: \${{ inputs.pull_request }}' '$ROOT/.github/workflows/promote.yml' && grep -qF 'CODEOWNER_LOGIN: jeancarlos' '$ROOT/.github/workflows/promote.yml' && grep -qF 'pulls/\$PR_NUMBER/reviews' '$ROOT/.github/workflows/promote.yml' && grep -qF 'HEAD_SHA=' '$ROOT/.github/workflows/promote.yml' && grep -qF 'headRefOid' '$ROOT/.github/workflows/promote.yml'"
check "promotion review lookup paginates and ignores comments" bash -c "grep -qF -- '--paginate --slurp' '$ROOT/tools/merge-promotion-pr.sh' && grep -qF 'state != \"COMMENTED\"' '$ROOT/tools/merge-promotion-pr.sh' && grep -qF -- '--paginate --slurp' '$ROOT/.github/workflows/promote.yml' && grep -qF 'state != \"COMMENTED\"' '$ROOT/.github/workflows/promote.yml'"
check "promote release tags the recorded merge commit" has promote.yml 'ref="refs/tags/$tag" -f sha="$merge_sha"'
check "promotion creates metadata commits without checking out workflow SHAs" bash -c "! grep -qF 'git checkout' '$ROOT/.github/workflows/promote.yml'"
check "release continuation reads merge metadata through the Contents API" bash -c "grep -qF 'contents/\$file?ref=\$ref' '$ROOT/.github/workflows/promote.yml' && grep -qF 'read_file_at \"\$MERGE_SHA\" config.xml' '$ROOT/.github/workflows/promote.yml'"
check "release continuation avoids checkout at the dispatch-provided SHA" bash -c "! grep -qF 'ref: \${{ inputs.merge_sha }}' '$ROOT/.github/workflows/promote.yml'"
check "promote validates release metadata as data from the merge commit" has promote.yml 'const config = fs.readFileSync(process.argv[1], "utf8")'
check "promote release does not execute scripts from the merged commit" bash -c "! grep -q 'bash tools/check-version.sh' '$ROOT/.github/workflows/promote.yml'"
check "promote dispatches release on the version tag" has promote.yml 'gh workflow run release.yml --ref "$tag" --repo "$GH_REPO"'
check "promote release retry runs even when main already contains develop" has promote.yml 'name: publish promotion release'
check "promote release verifies a pre-existing tag before skipping" has promote.yml '[ "$tag_sha" = "$merge_sha" ]'
check "promote release validates against the latest stable version" has promote.yml 'repos/$GH_REPO/releases/latest'
check "promotion detects an existing release before the version queue gate" has promote.yml 'release_exists=true'
check "existing releases bypass the next-patch gate for publication retries" has promote.yml '&& [ "$release_exists" = false ]; then'
check "promote queues later releases until the latest patch is published" has promote.yml 'release version $version is queued'
check "release resumes queued promotions after publication" has release.yml 'run: bash tools/resume-promotion-release.sh'
check "release retries publication idempotently before resuming the queue" has release.yml 'release $TAG already exists; refreshing its assets'
check "release serializes duplicate jobs for the same tag" has release.yml 'group: release-${{ github.ref_name }}'
check "promote resumes only the next queued patch" has_tool resume-promotion-release.sh 'if [ "$version" = "$expected_version" ]; then'
check "promote scans merged develop-to-main releases for the queued patch" has_tool resume-promotion-release.sh '--state merged --base main --head develop'
check "release queue reads package version at the exact merge SHA" has_tool resume-promotion-release.sh 'contents/package.json?ref=$merge_sha'
check "promote avoids dispatching an already queued tag release" has promote.yml 'headBranch == \"$tag\" and (.status != \"completed\" or .conclusion == \"success\")'
check "promote does not push to protected develop" bash -c "! grep -q 'git push origin .*develop' '$ROOT/.github/workflows/promote.yml'"
check "promote serializes runs per branch" has promote.yml 'cancel-in-progress: false'
check "promote ignores stale develop workflow runs but handles every main merge" has promote.yml 'if [[ "$HEAD_BRANCH" != main ]] && [ "$latest_sha" != "$SHA" ]; then'
check "promote requires commits ahead of main" has promote.yml 'if [ "$ahead_by" -eq 0 ]; then'
check "promote requires the next patch release version" has promote.yml 'if [ "$develop_version" != "$expected_version" ]; then'
check "promotion refreshes post-bump release notes before opening main PR" has promote.yml 'refresh-promotion-changelog.js'
check "promotion validates release-note refresh PRs against current develop" has promote.yml 'release-notes/v$version'
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
