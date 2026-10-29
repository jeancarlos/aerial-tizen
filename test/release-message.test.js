// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { formatReleaseMessage, summarizeCommits, updateRelease } = require('../tools/release-message');

const result = formatReleaseMessage('Playback starts faster.', [
  'feat: prebuffer next video',
  'fix: recover when a player is unavailable'
]);
assert.strictEqual(result, 'Playback starts faster.\n\n## Changes\n\n- feat: prebuffer next video\n- fix: recover when a player is unavailable\n');
assert.throws(() => formatReleaseMessage('', ['fix: example']), /summary/i);
assert.throws(() => formatReleaseMessage('Summary', []), /commit/i);

async function testSummary() {
  let request;
  const fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'A short summary.' } }] }) };
  };
  const summary = await summarizeCommits(['fix: improve playback'], 'example-key', fetch);
  assert.strictEqual(summary, 'A short summary.');
  assert.strictEqual(request.url, 'http://127.0.0.1:20128/v1/chat/completions');
  assert.ok(request.body.model.startsWith('ag/'), 'the Antigravity integration is used');
  assert.ok(request.body.messages.some(m => m.content.includes('fix: improve playback')));
  await assert.rejects(summarizeCommits(['fix: example'], 'example-key', async () => ({ ok: false, status: 401 })), /401/);
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'git' && args[0] === 'describe') return 'v1.0.4\n';
    if (command === 'git' && args[0] === 'log') return 'feat: play video\nbody detail\n\0\nfix: fallback\n\0\n';
    if (command === 'gh' && args.includes('--method')) return '';
    return JSON.stringify({ id: 123, body: '- Maintenance release.\n\nUpgrade: keep settings.' });
  };
  await updateRelease('v1.0.5', 'owner/repo', 'example-key', run, fetch);
  const update = calls.find(call => call.args.includes('--method'));
  assert.ok(update, 'the published release is updated');
  const content = JSON.parse(update.options.input).body;
  assert.ok(content.includes('- feat: play video\n- fix: fallback'), 'the exact subjects appear as bullets');
  assert.ok(content.includes('Upgrade: keep settings.'), 'upgrade information is preserved');
  assert.ok(!content.includes('Maintenance release.'), 'the maintenance placeholder is removed when commits explain the release');
  assert.ok(content.includes('A short summary.'));
  const alreadyUpdated = () => JSON.stringify({ id: 123, body: '<!-- release-summary -->\nexisting' });
  assert.strictEqual(await updateRelease('v1.0.5', 'owner/repo', 'example-key', alreadyUpdated, fetch), false);
  let reads = 0;
  const changed = (command, args) => {
    if (command === 'git' && args[0] === 'describe') return 'v1.0.4\n';
    if (command === 'git' && args[0] === 'log') return 'fix: example\n\0\n';
    return JSON.stringify({ id: 123, body: ++reads === 1 ? 'original' : 'edited by a person' });
  };
  await assert.rejects(updateRelease('v1.0.5', 'owner/repo', 'example-key', changed, fetch), /release changed/);
  await assert.rejects(updateRelease('-bad', 'owner/repo', 'example-key', run, fetch), /invalid/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-message-'));
  try {
    const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git(['init', '-q']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'previous']);
    git(['-c', 'tag.gpgSign=false', 'tag', 'v1.0.4']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fix: first line\nsecond line']);
    git(['-c', 'tag.gpgSign=false', 'tag', 'v1.0.5']);
    let saved;
    const realGit = (program, args, options) => {
      if (program === 'git') return git(args);
      if (args.includes('--method')) { saved = JSON.parse(options.input).body; return ''; }
      return JSON.stringify({ id: 123, body: '' });
    };
    await updateRelease('v1.0.5', 'owner/repo', 'example-key', realGit, fetch);
    assert.ok(saved.includes('- fix: first line\n'));
    assert.ok(!saved.includes('second line'), 'only the first line of each commit is included');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('release message tests passed');
}

testSummary().catch(error => { console.error(error); process.exitCode = 1; });
