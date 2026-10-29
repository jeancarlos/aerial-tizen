# Changelog

Notable changes per release. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

## 1.0.5 - 2026-10-29

The next video is prepared in the background while the current one plays, with normal loading as a fallback. This release also adds automated release summaries and improves playback test coverage.

- feat: prebuffer the next video with playback fallback
- Merge pull request #143 from jeancarlos/feature/avplay-prebuffer
- docs: add notes for the next release
- feat: prepare release summaries through 9router
- feat: isolate release runner in a container
- Merge pull request #145 from jeancarlos/feature/v1-0-5-release-notes
- docs: simplify release summary description
- Merge pull request #146 from jeancarlos/feature/release-notes-generation
- fix: stabilize playback restore coverage
- test: cover playback and unsupported controls
- Merge pull request #149 from jeancarlos/feature/stabilize-restore-test
- chore: prepare v1.0.5 release

## 1.0.4 - 2026-10-29

- Maintenance release.

## 1.0.3 - 2026-10-28

- Supports Tizen 5.5 on 2020 TVs and uses ADAPTIVE_INFO for 4K resolution detection.
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
