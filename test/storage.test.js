// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function load(opts) {
  opts = opts || {};
  const local = opts.local || new Map();
  const events = [];
  const ctx = {
    console,
    localStorage: opts.localStorage || {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => local.set(k, String(v))
    },
    telemetry: (event, fields) => events.push([event, fields]),
    telemetryRecent: () => [],
    telemetryProbe: query => events.push(['probe', query]),
    telemetryStarted: Date.now(),
    CATALOG: [{ label: 'A' }],
    playlist: [0],
    settings: { videoOrder: 'random', category: 'all', customServerEnabled: false },
    videoIndex: 0,
    document: { getElementById: () => opts.logview || null }
  };
  if (opts.tizen) ctx.tizen = opts.tizen;
  vm.createContext(ctx);
  for (const f of ['storage', 'debug']) {
    const file = path.join(__dirname, '../js', f + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return { ctx, events, local };
}

function fakePreference(store, failOn) {
  return {
    exists: k => store.has(k),
    getValue: k => store.get(k),
    setValue: (k, v) => {
      if (failOn) throw new Error(failOn);
      store.set(k, v);
    }
  };
}

function fakeFilesystem(opts) {
  opts = opts || {};
  const disk = { file: opts.content === undefined ? null : opts.content, writes: [] };
  const streamFor = () => ({
    write: text => {
      if (opts.writeThrows) throw new Error('disk full');
      disk.file = text;
      disk.writes.push(text);
    },
    close() {}
  });
  const file = {
    openStream: (mode, ok, fail) => {
      if (opts.openFails) return fail(new Error('denied'));
      disk.pending = () => ok(streamFor());
      if (!opts.manualFlush) disk.pending();
    },
    readAsText: (ok, fail) => (opts.readFails ? fail() : ok(disk.file))
  };
  const dir = {
    resolve: () => {
      if (disk.file === null) throw new Error('no file');
      return file;
    },
    createFile: () => {
      disk.file = '';
      return file;
    }
  };
  const filesystem = {
    resolve: (where, ok, fail) => {
      if (opts.resolveThrows) throw new Error('boom');
      if (opts.resolveFails) return fail();
      ok(dir);
    }
  };
  return { filesystem, disk };
}

{
  const t = load();
  assert.strictEqual(t.ctx.storageBackend(), 'localStorage');
  assert.strictEqual(t.ctx.storageSet('k', 7), true);
  assert.strictEqual(t.ctx.storageGet('k'), '7');
  let saved = 'unset';
  t.ctx.storageInitFile(s => { saved = s; });
  assert.strictEqual(saved, null, 'without a filesystem the init reports no saved state');
}

{
  const store = new Map();
  const t = load({ tizen: { preference: fakePreference(store) } });
  assert.strictEqual(t.ctx.storageBackend(), 'preference');
  t.ctx.storageSet('k', 'v');
  assert.strictEqual(t.ctx.storageGet('k'), 'v');
  assert.strictEqual(t.ctx.storageGet('missing'), null);
  assert.strictEqual(t.local.get('k'), 'v', 'localStorage keeps a copy');
}

{
  const t = load({ tizen: { preference: { exists: () => { throw new Error('x'); }, getValue() {}, setValue: () => { throw new Error('quota'); } } } });
  assert.strictEqual(t.ctx.storagePreferenceGet('k'), null, 'a throwing preference reads as empty');
  assert.strictEqual(t.ctx.storagePreferenceSet('k', 1), false);
  assert.ok(t.ctx.storageErrorList()[0].indexOf('preference: quota') === 0, 'the failure is kept for the debug board');
  assert.strictEqual(t.events[0][0], 'storage_write_error');
}

{
  const t = load({ localStorage: { getItem() { throw new Error('off'); }, setItem() { throw new Error('full'); } } });
  assert.strictEqual(t.ctx.storageGet('k'), null);
  assert.strictEqual(t.ctx.storageSet('k', 1), false, 'nothing could store the value');
  for (let i = 0; i < 12; i++) t.ctx.storageLocalSet('k', i);
  assert.strictEqual(t.ctx.storageErrorList().length, 8, 'the error list is capped');
}

{
  const t = load({ tizen: { preference: { setValue: 1 }, filesystem: { resolve() {} } } });
  assert.strictEqual(t.ctx.storageHasPreference(), false, 'setValue must be a function');
  assert.strictEqual(t.ctx.storageHasFilesystem(), true);
  const bare = load({ tizen: { get preference() { throw new Error('x'); }, get filesystem() { throw new Error('x'); } } });
  assert.strictEqual(bare.ctx.storageHasPreference(), false);
  assert.strictEqual(bare.ctx.storageHasFilesystem(), false);
}

{
  const fsys = fakeFilesystem({ content: JSON.stringify({ a: '1', b: '2' }), manualFlush: true });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  assert.strictEqual(t.ctx.storageBackend(), 'localStorage', 'before the file resolves it is not the backend');
  t.ctx.storageSet('early', 'e');
  assert.strictEqual(t.ctx.storageGet('early'), 'e', 'a write before the file resolves is readable');
  let restored = null;
  t.ctx.storageInitFile(s => { restored = s; });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(restored)), { a: '1', b: '2' });
  assert.strictEqual(t.ctx.storageBackend(), 'wgt-private');
  assert.strictEqual(t.ctx.storageGet('a'), '1');
  assert.strictEqual(t.ctx.storageFileSnapshotGet('a'), '1');
  assert.strictEqual(t.ctx.storageFileSnapshotGet('early'), null, 'the snapshot never holds this run');
  t.ctx.storageSet('a', '9');
  t.ctx.storageSet('c', '3');
  fsys.disk.pending();
  fsys.disk.pending();
  const final = JSON.parse(fsys.disk.file);
  assert.deepStrictEqual(final, { a: '9', b: '2', early: 'e', c: '3' }, 'a burst of writes ends with every value on disk');
}

{
  const fsys = fakeFilesystem({ content: 'not json' });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  let restored = 'unset';
  t.ctx.storageInitFile(s => { restored = s; });
  assert.strictEqual(restored, null, 'a corrupt file counts as no saved state');
  assert.strictEqual(t.ctx.storageFileSnapshotGet('x'), null);
}

{
  const fsys = fakeFilesystem({});
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  let restored = 'unset';
  t.ctx.storageInitFile(s => { restored = s; });
  assert.strictEqual(restored, null, 'a missing file is a first run');
  t.ctx.storageSet('k', 'v');
  assert.deepStrictEqual(JSON.parse(fsys.disk.file), { k: 'v' }, 'the file is created on the first write');
}

{
  const fsys = fakeFilesystem({ content: '{}', readFails: true });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  let restored = 'unset';
  t.ctx.storageInitFile(s => { restored = s; });
  assert.strictEqual(restored, null, 'an unreadable file counts as no saved state');
}

{
  for (const opts of [{ resolveFails: true }, { resolveThrows: true }]) {
    const fsys = fakeFilesystem(opts);
    const t = load({ tizen: { filesystem: fsys.filesystem } });
    let restored = 'unset';
    t.ctx.storageInitFile(s => { restored = s; });
    assert.strictEqual(restored, null, 'no directory means no saved state');
    assert.strictEqual(t.ctx.storageSet('k', 'v'), true, 'the other backends still take the write');
    t.ctx.storageInitFile();
  }
}

{
  const fsys = fakeFilesystem({ content: '{}', writeThrows: true });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  t.ctx.storageInitFile();
  t.ctx.storageSet('k', 'v');
  assert.ok(t.ctx.storageErrorList().some(e => e.indexOf('wgt-private: disk full') === 0), 'a failed write is reported');
  t.ctx.storageSet('k', 'w');
  assert.strictEqual(fsys.disk.writes.length, 0);
}

{
  const fsys = fakeFilesystem({ content: '{}', openFails: true });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  t.ctx.storageInitFile();
  t.ctx.storageSet('k', 'v');
  assert.ok(t.ctx.storageErrorList().some(e => e.indexOf('wgt-private: denied') === 0), 'a refused stream is reported');
  const broken = { resolve: (w, ok) => ok({ resolve: () => { throw new Error('x'); }, createFile: () => { throw new Error('no create'); } }) };
  const t2 = load({ tizen: { filesystem: broken } });
  t2.ctx.storageInitFile();
  t2.ctx.storageSet('k', 'v');
  assert.ok(t2.ctx.storageErrorList().some(e => e.indexOf('wgt-private: no create') === 0), 'a failed create is reported');
}

{
  const shared = new Map();
  const pref = new Map();
  const first = load({ local: shared, tizen: { preference: fakePreference(pref) } });
  first.ctx.debugProbeSyncBackends();
  assert.strictEqual(first.ctx.debugBackends.preference.state, 'readback-ok');
  assert.strictEqual(first.ctx.debugBackends.localStorage.state, 'readback-ok');
  assert.strictEqual(first.ctx.debugBackends['wgt-private'].state, 'absent');
  const second = load({ local: shared, tizen: { preference: fakePreference(pref) } });
  second.ctx.debugProbeSyncBackends();
  assert.strictEqual(second.ctx.debugBackends.preference.state, 'survived', 'a marker from an earlier run is a survivor');
  assert.strictEqual(second.ctx.debugBootCount, 2);
  const lines = second.ctx.debugLines().join('\n');
  assert.ok(lines.indexOf('preference: survived') >= 0 && lines.indexOf('source: apple cdn') >= 0, lines);
}

{
  const t = load({ tizen: { preference: fakePreference(new Map(), 'ro') }, localStorage: { getItem: () => null, setItem() { throw new Error('ro'); } } });
  t.ctx.debugProbeSyncBackends();
  assert.strictEqual(t.ctx.debugBackends.preference.state, 'write-failed');
  assert.strictEqual(t.ctx.debugBackends.localStorage.state, 'write-failed');
  assert.ok(t.ctx.debugLines().some(l => l.indexOf('  ! ') === 0), 'errors show on the board');
  assert.strictEqual(t.ctx.debugClassify(null, true, false).state, 'write-ok');
}

{
  const fsys = fakeFilesystem({ content: JSON.stringify({ aerial_probe_marker: '1-abc|2026-01-01T00:00:00.000Z' }) });
  const t = load({ tizen: { filesystem: fsys.filesystem } });
  t.ctx.debugProbeSyncBackends();
  assert.strictEqual(t.ctx.debugBackends['wgt-private'].state, 'pending');
  t.ctx.storageInitFile(() => t.ctx.debugProbeFileBackend());
  assert.strictEqual(t.ctx.debugBackends['wgt-private'].state, 'survived', 'the file snapshot proves a restart');
  assert.ok(t.events.some(e => e[0] === 'probe' && /wgt_private=survived/.test(e[1])), 'the verdict goes out as the probe query');
  const bare = load();
  bare.ctx.debugProbeFileBackend();
  assert.strictEqual(bare.events.length, 0, 'without a filesystem the file probe does nothing');
}

{
  const classes = new Set();
  const view = {
    classList: { toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)), contains: c => classes.has(c) },
    textContent: ''
  };
  const t = load({ logview: view });
  t.ctx.debugToggle();
  assert.ok(view.textContent.indexOf('STORAGE') === 0, 'opening the board renders it');
  t.ctx.debugToggle();
  const before = view.textContent;
  t.ctx.debugRender();
  assert.strictEqual(view.textContent, before, 'a hidden board is not redrawn');
  const none = load();
  none.ctx.debugToggle();
  none.ctx.debugRender();
}

console.log('storage tests passed');
