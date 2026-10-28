// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');

function refreshPromotionChangelog(root) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('release version must be numeric major.minor.patch');
  }

  const changelogPath = path.join(root, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const headings = Array.from(changelog.matchAll(/^## .+$/gm));
  const unreleasedMatches = headings.filter(match => /^## Unreleased\s*$/.test(match[0]));
  if (unreleasedMatches.length !== 1) throw new Error('CHANGELOG.md must have exactly one Unreleased section');

  const unreleased = unreleasedMatches[0];
  const unreleasedIndex = headings.indexOf(unreleased);
  const versionHeading = new RegExp('^## ' + version.replaceAll('.', '\\.') + '(?:\\s|$)');
  const releaseMatches = headings.filter(match => versionHeading.test(match[0]));
  if (releaseMatches.length !== 1 || !new RegExp('^## ' + version.replaceAll('.', '\\.') + ' - \\d{4}-\\d{2}-\\d{2}$').test(releaseMatches[0]?.[0] || '')) {
    throw new Error('CHANGELOG.md must have exactly one ' + version + ' release section');
  }

  const release = releaseMatches[0];
  const releaseIndex = headings.indexOf(release);
  if (releaseIndex !== unreleasedIndex + 1) {
    throw new Error('the ' + version + ' release section must follow Unreleased');
  }

  const unreleasedStart = unreleased.index + unreleased[0].length;
  const newNotes = changelog.slice(unreleasedStart, release.index).trim();
  if (!newNotes) return { changed: false, version };

  const releaseEnd = headings[releaseIndex + 1]?.index ?? changelog.length;
  const existingNotes = changelog.slice(release.index + release[0].length, releaseEnd).trim();
  const suffix = changelog.slice(releaseEnd).replace(/^\s*/, '');
  const prefix = changelog.slice(0, unreleased.index).replace(/\s*$/, '');
  const releaseNotes = [existingNotes, newNotes].filter(Boolean).join('\n\n');
  const updated = prefix + '\n\n' + unreleased[0] + '\n\n' + release[0] + '\n\n' + releaseNotes +
    (suffix ? '\n\n' + suffix : '') + '\n';
  fs.writeFileSync(changelogPath, updated);
  return { changed: true, version };
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) {
    console.error('Usage: node tools/refresh-promotion-changelog.js PROJECT_ROOT');
    process.exitCode = 2;
  } else {
    try {
      const result = refreshPromotionChangelog(root);
      console.log(result.changed ? 'Updated v' + result.version + ' release notes' : 'No Unreleased notes for v' + result.version);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { refreshPromotionChangelog };
