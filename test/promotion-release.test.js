// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const helper = path.join(rootDir, 'tools/prepare-promotion-release.js');
let passed = 0;
let failed = 0;

function test(name, run) {
  try {
    run();
    console.log('  ✓ ' + name);
    passed++;
  } catch (error) {
    console.log('  ✗ ' + name + ': ' + error.message);
    failed++;
  }
}

function fixture(version, changelog) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-release-test-'));
  fs.writeFileSync(path.join(root, 'config.xml'), '<widget version="' + version + '"></widget>\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'aerial-tizen', version }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    name: 'aerial-tizen',
    version,
    packages: { '': { name: 'aerial-tizen', version } }
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  return root;
}

function runHelper(root) {
  return spawnSync(process.execPath, [helper, root, '2026-10-28'], { encoding: 'utf8' });
}

const startingChangelog = '# Changelog\n\n## Unreleased\n\n- Add Tizen support.\n\n## 1.0.2 - 2026-10-17\n\n- Previous release.\n';

test('patch bump synchronizes config, package, and lock versions', () => {
  const root = fixture('2.4.8', startingChangelog);
  try {
    const result = runHelper(root);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(require(path.join(root, 'package.json')).version, '2.4.9');
    const lock = require(path.join(root, 'package-lock.json'));
    assert.strictEqual(lock.version, '2.4.9');
    assert.strictEqual(lock.packages[''].version, '2.4.9');
    assert.match(fs.readFileSync(path.join(root, 'config.xml'), 'utf8'), /version="2\.4\.9"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('changelog rotation preserves Unreleased notes and previous releases', () => {
  const root = fixture('2.4.8', startingChangelog);
  try {
    const result = runHelper(root);
    assert.strictEqual(result.status, 0, result.stderr);
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## Unreleased\n\n## 2\.4\.9 - 2026-10-28\n\n- Add Tizen support\./);
    assert.match(changelog, /## 1\.0\.2 - 2026-10-17\n\n- Previous release\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty Unreleased section gets a maintenance note', () => {
  const root = fixture('2.4.8', '# Changelog\n\n## Unreleased\n\n## 1.0.2 - 2026-10-17\n\n- Previous release.\n');
  try {
    const result = runHelper(root);
    assert.strictEqual(result.status, 0, result.stderr);
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 2\.4\.9 - 2026-10-28\n\n- Maintenance release\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('version mismatch fails before changing any file', () => {
  const root = fixture('2.4.8', startingChangelog);
  const configPath = path.join(root, 'config.xml');
  fs.writeFileSync(configPath, '<widget version="2.4.7"></widget>\n');
  const files = ['config.xml', 'package.json', 'package-lock.json', 'CHANGELOG.md'];
  const before = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  try {
    const result = runHelper(root);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /version mismatch/);
    const after = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
    assert.deepStrictEqual(after, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log('\n' + (passed + failed) + ' tests, ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
