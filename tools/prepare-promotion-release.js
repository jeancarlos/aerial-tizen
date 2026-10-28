// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function preparePromotionRelease(root, releaseDate = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || new Date(releaseDate).toISOString().slice(0, 10) !== releaseDate) {
    throw new Error('release date must be a valid YYYY-MM-DD date');
  }

  const configPath = path.join(root, 'config.xml');
  const packagePath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const configXml = fs.readFileSync(configPath, 'utf8');
  const packageJson = readJson(packagePath);
  const packageLock = readJson(lockPath);
  const widget = configXml.match(/<widget\b[^>]*>/);
  const widgetVersion = widget && widget[0].match(/\bversion="([^"]+)"/);
  const versions = [widgetVersion && widgetVersion[1], packageJson.version, packageLock.version, packageLock.packages && packageLock.packages[''] && packageLock.packages[''].version];

  if (versions.some(version => !version) || !versions.every(version => version === versions[0])) {
    throw new Error('version mismatch: config.xml=' + versions[0] + ' package.json=' + versions[1] + ' package-lock.json=' + versions[2]);
  }

  const semver = versions[0].match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!semver) throw new Error('release version must be numeric major.minor.patch');
  const nextVersion = semver[1] + '.' + semver[2] + '.' + (Number(semver[3]) + 1);

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const headings = Array.from(changelog.matchAll(/^## .+$/gm));
  const unreleasedIndex = headings.findIndex(match => /^## Unreleased\s*$/.test(match[0]));
  if (unreleasedIndex < 0) throw new Error('CHANGELOG.md has no Unreleased section');

  const unreleased = headings[unreleasedIndex];
  const nextHeading = headings[unreleasedIndex + 1];
  const contentStart = unreleased.index + unreleased[0].length;
  const contentEnd = nextHeading ? nextHeading.index : changelog.length;
  const notes = changelog.slice(contentStart, contentEnd).trim() || '- Maintenance release.';
  const prefix = changelog.slice(0, unreleased.index).replace(/\s*$/, '');
  const suffix = nextHeading ? changelog.slice(nextHeading.index).replace(/^\s*/, '') : '';
  const updatedChangelog = prefix + '\n\n## Unreleased\n\n## ' + nextVersion + ' - ' + releaseDate + '\n\n' + notes + (suffix ? '\n\n' + suffix : '') + '\n';

  const updatedWidget = widget[0].replace(/\bversion="[^"]+"/, 'version="' + nextVersion + '"');
  const updatedConfig = configXml.replace(widget[0], updatedWidget);
  packageJson.version = nextVersion;
  packageLock.version = nextVersion;
  packageLock.packages[''].version = nextVersion;

  fs.writeFileSync(configPath, updatedConfig);
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  fs.writeFileSync(lockPath, JSON.stringify(packageLock, null, 2) + '\n');
  fs.writeFileSync(changelogPath, updatedChangelog);

  return { previousVersion: versions[0], version: nextVersion, releaseDate };
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root || process.argv.length > 4) {
    console.error('Usage: node tools/prepare-promotion-release.js PROJECT_ROOT [YYYY-MM-DD]');
    process.exitCode = 2;
  } else {
    try {
      const release = preparePromotionRelease(root, process.argv[3]);
      console.log('Prepared v' + release.version + ' from v' + release.previousVersion + ' (' + release.releaseDate + ')');
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { preparePromotionRelease };
