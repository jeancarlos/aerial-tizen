# Changelog

Notable changes per release. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

- Release archives are stored uncompressed so anyone can rebuild one bit for bit from its tag; the README shows how.
- The demo shows a real frame of each video, lists all 115 videos with Play buttons and a filter, and can play real video through an optional Cloudflare Worker (`worker/`).
- CI fails below 90% test coverage, and zizmor is a required check on `main` and `develop`.
- The demo page ships a Content Security Policy and the proxy Worker answers with nosniff.
- Every source file now carries an SPDX copyright and licence header.

## 1.0.2 - 2026-10-17

- The release workflow refuses a tag that does not match the version in `config.xml`, `package.json` and `package-lock.json`, and CI fails when the three disagree.
- Release packaging no longer caches Node packages.

## 1.0.1 - 2026-10-17

- Replaces 1.0.0. The release archive is signed with cosign and verified in the workflow.
- Added the signed release pipeline, CodeQL, gitleaks, osv-scanner, zizmor, OpenSSF Scorecard and Dependabot with auto-merge for patch and minor updates.
- Branch rulesets on `main` and `develop`, and a workflow that promotes `develop` to `main` after CI passes.
- Property-based fuzzing of stored settings.

## 1.0.0 - 2026-10-17

- First tagged release. Withdrawn and replaced by 1.0.1.
