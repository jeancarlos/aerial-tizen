// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { refreshPromotionChangelog } = require('../tools/refresh-promotion-changelog');

const original = '# Changelog\n\n## Unreleased\n\n- Add new playback support.\n\n## 1.0.3 - 2026-10-28\n\n- Add Tizen support.\n\n## 1.0.2 - 2026-10-17\n\n- Previous release.\n';

function run(changelog) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-refresh-test-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.3' }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  try {
    const result = refreshPromotionChangelog(root);
    return { result, changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

let passed = 0;
let failed = 0;
function test(name, runTest) {
  try {
    runTest();
    console.log('  ✓ ' + name);
    passed++;
  } catch (error) {
    console.log('  ✗ ' + name + ': ' + error.message);
    failed++;
  }
}

test('moves new Unreleased notes into the existing release section', () => {
  const { result, changelog } = run(original);
  assert.deepStrictEqual(result, { changed: true, version: '1.0.3' });
  assert.match(changelog, /## Unreleased\n\n## 1\.0\.3 - 2026-10-28\n\n- Add Tizen support\.\n\n- Add new playback support\./);
  assert.match(changelog, /## 1\.0\.2 - 2026-10-17\n\n- Previous release\./);
});

test('leaves an empty Unreleased section unchanged', () => {
  const changelog = original.replace('## Unreleased\n\n- Add new playback support.\n\n', '## Unreleased\n\n');
  const { result, changelog: updated } = run(changelog);
  assert.deepStrictEqual(result, { changed: false, version: '1.0.3' });
  assert.strictEqual(updated, changelog);
});

test('rejects an ambiguous release heading without changing the file', () => {
  const changelog = original.replace('## 1.0.2 - 2026-10-17', '## 1.0.3 - 2026-10-17');
  assert.throws(() => run(changelog), /exactly one 1\.0\.3 release section/);
});

test('command line refresh writes the updated changelog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-refresh-cli-test-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.3' }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), original);
  try {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../tools/refresh-promotion-changelog.js'), root], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /Updated v1\.0\.3 release notes/);
    assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /- Add new playback support\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log('\n' + (passed + failed) + ' tests, ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
