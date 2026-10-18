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
check "promote waits for test reuse zizmor" has promote.yml 'for name in test reuse zizmor'
check "promote falls back to a direct merge when auto-merge refuses a clean PR" has promote.yml 'gh pr merge "$pr" --auto --merge --match-head-commit "$SHA" || gh pr merge "$pr" --merge --match-head-commit "$SHA"'
check "promote says the PR merges once its checks pass" has promote.yml 'merges once its checks pass'
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
