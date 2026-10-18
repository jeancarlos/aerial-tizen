// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function boot(opts) {
  opts = opts || {};
  const listeners = {};
  const timers = new Map();
  let nextTimerId = 1;
  let now = 0;
  const opened = [];
  let listener = null;
  const elements = {};
  const makeEl = () => {
    const classes = new Set();
    return {
      classes,
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
        toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)),
      },
      appendChild() {},
      set textContent(v) { this._text = v; },
      get textContent() { return this._text; },
    };
  };
  const el = id => (elements[id] = elements[id] || makeEl());
  const ctx = {
    console,
    CATALOG: [0, 1, 2, 3, 4].map(i => ({ url: 'http://x/v' + i + '.mov', label: 'L' + i, description: '', category: i < 3 ? 'sea' : 'space' })),
    localStorage: (() => {
      const store = new Map();
      return { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    })(),
    document: { hidden: false, getElementById: el, addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn), createElement: makeEl, createTextNode: () => ({}) },
    Image: function () {},
    setTimeout: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, at: now + (ms || 0) }); return id; },
    clearTimeout: id => timers.delete(id),
    tizen: { tvinputdevice: { registerKey() {} }, application: {} },
    webapis: {
      avplay: {
        open: url => opened.push(url),
        stop() {}, close() {}, setDisplayRect() {}, setStreamingProperty() {}, play() {},
        setListener: l => { listener = l; },
        prepareAsync: ok => ok()
      }
    }
  };
  Object.assign(ctx, opts.extra || {});
  let pendingRead = null;
  if (opts.fileContent !== undefined) {
    const file = { readAsText: ok => { pendingRead = () => ok(typeof opts.fileContent === 'function' ? opts.fileContent(ctx) : opts.fileContent); }, openStream: (mode, ok) => ok({ write() {}, close() {} }) };
    const dir = { resolve: () => { if (opts.fileContent === null) throw new Error('no file'); return file; }, createFile: () => file };
    ctx.tizen.filesystem = { resolve: (where, ok) => ok(dir) };
  }
  vm.createContext(ctx);
  for (const f of ['storage', 'telemetry', 'settings', 'player', 'menu', 'debug']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx, { filename: path.join(__dirname, '../js', f + '.js') });
  }
  // Virtual clock: a test says how long it waited, and the clock decides what
  // that was long enough to fire. Adding a setTimeout anywhere in the player no
  // longer changes what an unrelated test sees.
  const advance = ms => {
    const until = now + ms;
    for (;;) {
      let due = null;
      for (const timer of timers) {
        if (timer[1].at <= until && (due === null || timer[1].at < due[1].at)) due = timer;
      }
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = until;
  };
  const events = [];
  // keep the real implementation reachable: the spy below replaces the global
  ctx.realTelemetry = ctx.telemetry;
  ctx.telemetry = (event, fields) => events.push([event, fields || {}]);
  if (opts.main) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8'), ctx, { filename: path.join(__dirname, '../js/main.js') });
  const press = code => (listeners.keydown || []).forEach(fn => fn({ keyCode: code }));
  const hide = hidden => { ctx.document.hidden = hidden; (listeners.visibilitychange || []).forEach(fn => fn()); };
  return { ctx, opened, advance, events, elements, press, hide, finishRead: () => { if (pendingRead) pendingRead(); }, pending: () => timers.size, listener: () => listener };
}

const { PRELOAD_FADE_MS, BUFFER_TIMEOUT_MS, RETRY_DELAYS_MS, ERROR_SKIP_MS, MAX_SKIP_DELAY_MS } = boot().ctx;

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.videoOrder = 'sequential'; buildPlaylist(); playVideo(pickNext());", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  for (let i = 0; i < 3; i++) t.listener().onbufferingcomplete();
  t.listener().onstreamcompleted();
  t.advance(PRELOAD_FADE_MS);
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v1.mov'], 'rebuffering must not skip videos in sequential order');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0); playVideo(1); playVideo(2);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  assert.deepStrictEqual(t.opened, ['http://x/v2.mov'], 'rapid skips must only start the last video');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  t.listener().onbufferingcomplete();
  vm.runInContext("settings.category = 'space'; buildPlaylist(); playVideo(takeNext());", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  assert.ok(['http://x/v3.mov', 'http://x/v4.mov'].includes(t.opened[1]), 'category change must drop the prefetched video');
}

{
  const t = boot();
  const stale = [];
  t.ctx.webapis.avplay.prepareAsync = (ok, fail) => stale.push(fail);
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  vm.runInContext("playVideo(1);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  stale[0]();
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v1.mov'], 'a stale prepare failure must not reopen the old video');
}

{
  const t = boot();
  const fails = [];
  t.ctx.webapis.avplay.prepareAsync = (ok, fail) => fails.push(fail);
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  for (let i = 0; i < 3; i++) { fails[fails.length - 1](); t.advance(RETRY_DELAYS_MS[1]); }
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov', 'http://x/v0.mov', 'https://x/v0.mov'],
    'a failing URL must be retried twice before the next URL is tried'
  );
}

{
  const t = boot();
  const prepared = [];
  t.ctx.webapis.avplay.prepareAsync = ok => prepared.push(ok);
  t.ctx.webapis.avplay.play = () => { throw new Error('InvalidStateError'); };
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  prepared[0]();
  t.advance(RETRY_DELAYS_MS[0]);
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v0.mov'], 'a play() exception must retry instead of stalling');
}

{
  const t = boot();
  const prefs = {};
  t.ctx.tizen.preference = {
    exists: k => k in prefs,
    getValue: k => prefs[k],
    setValue: (k, v) => { prefs[k] = v; }
  };
  vm.runInContext("loadSettings(); settings.videoOrder = 'sequential'; saveSettings(); playVideo(3);", t.ctx);
  assert.strictEqual(prefs.aerial_index, '3', 'playback position must be written to tizen.preference');
  vm.runInContext("settings = {}; loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.videoOrder, 'sequential', 'settings must load back from tizen.preference');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  t.advance(BUFFER_TIMEOUT_MS);
  t.advance(RETRY_DELAYS_MS[0]);
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'a stream that never reports buffering must be retried, not left hanging'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  t.listener().onbufferingcomplete();
  t.advance(BUFFER_TIMEOUT_MS * 2);
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov'], 'buffering completion must cancel the watchdog');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.descriptionTimer = 99; saveSettings(); settings = {}; loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.descriptionTimer, 15, 'a stored timer above the maximum must clamp on load');
  vm.runInContext("settings.descriptionTimer = -5; saveSettings(); settings = {}; loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.descriptionTimer, 1, 'a stored timer below the minimum must clamp on load');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  const stale = t.listener();
  stale.onerror('first');
  stale.onerror('duplicate');
  t.advance(RETRY_DELAYS_MS[0]);
  t.listener().onbufferingcomplete();
  stale.onerror('late');
  t.advance(BUFFER_TIMEOUT_MS * 2);
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v0.mov'], 'duplicate and stale errors must not retry the current stream');
}
{
  const t = boot();
  t.ctx.webapis.avplay.prepareAsync = () => {};
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  t.advance(BUFFER_TIMEOUT_MS);
  t.advance(RETRY_DELAYS_MS[0]);
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'a prepare that never calls back must time out and retry'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  t.listener().onbufferingcomplete();
  t.listener().onbufferingstart();
  t.advance(BUFFER_TIMEOUT_MS);
  t.advance(RETRY_DELAYS_MS[0]);
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'a stall after playback started must re-arm the watchdog and retry'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.devMode = true; settings.customServerEnabled = true; settings.customServerUrl = 'http://lan:8090';", t.ctx);
  const urls = vm.runInContext("getVideoUrls(0)", t.ctx);
  assert.deepStrictEqual(
    [...urls],
    ['http://lan:8090/v0.mov', 'http://x/v0.mov', 'https://x/v0.mov'],
    'custom server mode must keep the catalog URL as a fallback'
  );
}

{
  const t = boot();
  const fails = [];
  t.ctx.webapis.avplay.prepareAsync = (ok, fail) => fails.push(fail);
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  fails[0]();
  const failure = t.events.find(([e]) => e === 'playback_failure');
  assert.ok(failure, 'a failed attempt must emit a telemetry event: ' + JSON.stringify(t.events));
  assert.strictEqual(failure[1].url, 'http://x/v0.mov', 'the event must name the URL that failed');
  assert.ok(failure[1].reason, 'the event must carry a reason');
  assert.ok(['preparing', 'playing'].indexOf(failure[1].phase) !== -1, 'and must name the phase that failed, not guess from the event name: ' + failure[1].phase);
}

{
  const t = boot();
  vm.runInContext("loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.telemetryEnabled(), false, 'telemetry must stay off without a configured client token');
}

{
  const t = boot();
  t.ctx.AERIAL_LOCAL_SERVER = 'http://192.168.2.4:8090';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/settings.js'), 'utf8'), t.ctx);
  vm.runInContext("settings = {}; localStorage.setItem('aerial_settings', JSON.stringify({customServerUrl: 'http://192.168.0.100:8090'})); loadSettings();", t.ctx);
  assert.strictEqual(
    t.ctx.settings.customServerUrl,
    'http://192.168.2.4:8090',
    'the deployed server address must override a stored one'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  const before = t.opened.length;
  vm.runInContext("applySetting('category', 'space');", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  assert.strictEqual(t.opened.length, before + 1, 'changing category must restart playback');
  assert.ok(['http://x/v3.mov', 'http://x/v4.mov'].includes(t.opened[before]), 'the restarted video must come from the new category: ' + t.opened[before]);
}

{
  const t = boot();
  let pending = null;
  vm.runInContext("loadSettings(); settings.devMode = true; buildPlaylist(); openMenu();", t.ctx);
  t.ctx.testConnection = (url, cb) => { pending = cb; };
  vm.runInContext("menuIndex = getVisibleMenuItems().findIndex(function (i) { return i.key === 'customServerEnabled'; }); settings.customServerEnabled = false; menuChangeValue(1);", t.ctx);
  assert.strictEqual(t.ctx.menuBusyKey, 'customServerEnabled', 'the row must show a busy state while the test runs');
  vm.runInContext("menuChangeValue(1); menuChangeValue(-1);", t.ctx);
  assert.ok(pending, 'no second test may start while one is pending');
  pending(true);
  assert.strictEqual(t.ctx.menuBusyKey, null, 'the busy state must clear when the test finishes');
  assert.strictEqual(t.ctx.settings.customServerEnabled, true, 'a successful test must enable the server');
}

{
  const t = boot();
  t.ctx.AERIAL_LOCAL_SERVER = 'http://192.168.2.4:8090';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/settings.js'), 'utf8'), t.ctx);
  vm.runInContext("settings = {}; localStorage.setItem('aerial_settings', JSON.stringify({customServerEnabled: false, devMode: false, customServerUrl: 'http://192.168.0.100:8090'})); loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.customServerEnabled, true, 'a shipped server address must beat a stored disabled toggle');
  assert.strictEqual(t.ctx.settings.customServerUrl, 'http://192.168.2.4:8090', 'and it must beat a stored address');
  const urls = [...vm.runInContext("getVideoUrls(0)", t.ctx)];
  assert.ok(urls[0].startsWith('http://192.168.2.4:8090/'), 'the LAN URL must be tried first: ' + urls[0]);
  assert.ok(urls.length > 1, 'with the catalog URL kept as a fallback');
}

{
  const t = boot();
  let state = 'PLAYING';
  t.ctx.webapis.avplay.getState = () => state;
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  state = 'PAUSED';
  t.advance(BUFFER_TIMEOUT_MS);
  t.advance(BUFFER_TIMEOUT_MS);
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov'], 'a paused video must not be restarted by the watchdog');
  state = 'PLAYING';
  t.advance(BUFFER_TIMEOUT_MS);
  t.advance(RETRY_DELAYS_MS[0]);
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'but a real stall after resuming must still be caught'
  );
}

{
  const t = boot();
  const prefs = {};
  t.ctx.tizen.preference = {
    exists: k => k in prefs,
    getValue: k => prefs[k],
    setValue: (k, v) => { prefs[k] = v; }
  };
  vm.runInContext("storageSet('aerial_index', 7);", t.ctx);
  assert.strictEqual(prefs.aerial_index, '7', 'preference must be written when the API exists');
  assert.strictEqual(t.ctx.storageBackend(), 'preference', 'and must be reported as the backend');
}

{
  const t = boot();
  const written = {};
  t.ctx.tizen.filesystem = {
    resolve: (name, ok) => ok({
      resolve: () => ({
        readAsText: (cb) => cb(JSON.stringify({ aerial_index: '4' })),
        openStream: (mode, cb) => cb({ write: (text) => { written.text = text; }, close() {} })
      }),
      createFile: () => ({
        openStream: (mode, cb) => cb({ write: (text) => { written.text = text; }, close() {} })
      })
    })
  };
  vm.runInContext("storageInitFile(function (saved) { globalThis.__saved = saved; });", t.ctx);
  assert.strictEqual(t.ctx.__saved && t.ctx.__saved.aerial_index, '4', 'the durable file must be read at start-up');
  assert.strictEqual(t.ctx.storageGet('aerial_index'), '4', 'and its values must be readable');
  vm.runInContext("storageSet('aerial_index', 9);", t.ctx);
  assert.ok(written.text && written.text.indexOf('"9"') !== -1, 'writes must reach the file: ' + written.text);
  assert.strictEqual(t.ctx.storageBackend(), 'wgt-private', 'the file must be reported as the backend');
}

{
  const t = boot();
  vm.runInContext("storageSet('aerial_index', 2);", t.ctx);
  assert.strictEqual(t.ctx.storageBackend(), 'localStorage', 'with neither API present the fallback is reported honestly');
  assert.strictEqual(t.ctx.storageGet('aerial_index'), '2', 'and it still round-trips');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  assert.ok(t.elements.loading.classes.has('visible'), 'the loading screen must show while a video prepares');
  t.advance(PRELOAD_FADE_MS);
  t.listener().onbufferingcomplete();
  assert.ok(!t.elements.loading.classes.has('visible'), 'and must clear once the video is buffered');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); realTelemetry('one', {}); realTelemetry('two', {}); debugToggle();", t.ctx);
  assert.ok(t.elements.logview.classes.has('visible'), 'the log view must toggle on');
  assert.ok(t.elements.logview.textContent.indexOf('two') !== -1, 'and render recent events: ' + t.elements.logview.textContent);
}

{
  const t = boot();
  const prefs = {};
  t.ctx.tizen.preference = {
    exists: k => k in prefs,
    getValue: k => prefs[k],
    setValue: (k, v) => { prefs[k] = v; }
  };
  vm.runInContext("loadSettings(); buildPlaylist(); debugProbeSyncBackends();", t.ctx);
  assert.strictEqual(t.ctx.debugBootCount, 1, 'a first run counts as boot 1');
  assert.strictEqual(t.ctx.debugBackends.preference.state, 'readback-ok', 'a first run has no earlier marker');

  const second = boot();
  second.ctx.tizen.preference = {
    exists: k => k in prefs,
    getValue: k => prefs[k],
    setValue: (k, v) => { prefs[k] = v; }
  };
  vm.runInContext("loadSettings(); buildPlaylist(); debugProbeSyncBackends();", second.ctx);
  assert.strictEqual(second.ctx.debugBootCount, 2, 'a later run reads the earlier count back');
  assert.strictEqual(second.ctx.debugBackends.preference.state, 'survived', 'a later run must see the earlier marker as survived');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); debugProbeSyncBackends(); debugToggle();", t.ctx);
  const text = t.elements.logview.textContent;
  for (const needle of ['STORAGE', 'boot 1', 'preference:', 'wgt-private:', 'localStorage:', 'PLAYBACK', 'EVENTS']) {
    assert.ok(text.indexOf(needle) !== -1, 'the board must report ' + needle + ': ' + text.slice(0, 120));
  }
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.advance(PRELOAD_FADE_MS);
  vm.runInContext("stopPlayback();", t.ctx);
  assert.strictEqual(t.pending(), 0, 'stopping playback must leave no timer running behind the viewer');
}

{
  const t = boot();
  t.ctx.CATALOG[0].url = 'https://x/v0.mov';
  vm.runInContext("loadSettings();", t.ctx);
  assert.deepStrictEqual(
    [...vm.runInContext("getVideoUrls(0)", t.ctx)],
    ['https://x/v0.mov'],
    'an https catalog URL must not be retried twice as its own fallback'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.devMode = true; settings.customServerEnabled = true; settings.customServerUrl = 'http://x';", t.ctx);
  assert.deepStrictEqual(
    [...vm.runInContext("getVideoUrls(0)", t.ctx)],
    ['http://x/v0.mov', 'https://x/v0.mov'],
    'a custom server pointed at the catalog host must not double the retry budget'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist();", t.ctx);
  for (let i = 0; i < 6; i++) vm.runInContext("skipAfterError();", t.ctx);
  t.advance(ERROR_SKIP_MS);
  t.advance(PRELOAD_FADE_MS);
  assert.deepStrictEqual(t.opened, [], 'a streak of failures must not keep retrying on the base delay');
  t.advance(MAX_SKIP_DELAY_MS);
  t.advance(PRELOAD_FADE_MS);
  assert.strictEqual(t.opened.length, 1, 'but the backoff must expire and try again');

  t.listener().onbufferingcomplete();
  vm.runInContext("skipAfterError();", t.ctx);
  t.advance(ERROR_SKIP_MS);
  t.advance(PRELOAD_FADE_MS);
  assert.strictEqual(t.opened.length, 2, 'and a video that plays must clear the streak');
}

{
  const t = boot();
  const values = vm.runInContext(
    "MENU_ITEMS.filter(function (i) { return i.key === 'category'; })[0].options.map(function (o) { return o.value; })",
    t.ctx
  );
  assert.deepStrictEqual([...values], ['all', 'space', 'sea'], 'only categories the catalog can fill may be offered');
}

{
  const t = boot();
  vm.runInContext("settings = {}; localStorage.setItem('aerial_settings', JSON.stringify({category: 'cityscape'})); loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.category, 'all', 'a stored category the catalog cannot fill must fall back to all');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.category = 'cityscape'; buildPlaylist();", t.ctx);
  assert.ok(
    t.events.some(([e]) => e === 'category_empty'),
    'an unfillable category must be reported, not silently ignored: ' + JSON.stringify(t.events)
  );
  assert.strictEqual(t.ctx.playlist.length, 5, 'and playback must still have the whole catalog to fall back on');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  assert.ok(t.elements.loading.classes.has('visible'), 'the first video must show the spinner');
  t.advance(PRELOAD_FADE_MS);
  t.listener().onbufferingcomplete();
  vm.runInContext("playVideo(1);", t.ctx);
  assert.ok(!t.elements.loading.classes.has('visible'), 'a later transition must not flash the spinner again');
  vm.runInContext("skipAfterError(); playVideo(2);", t.ctx);
  assert.ok(t.elements.loading.classes.has('visible'), 'but a stream that keeps failing must bring it back');
}

{
  const t = boot();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/catalog.js'), 'utf8'), t.ctx);
  const listed = require('child_process')
    .execFileSync('bash', [path.join(__dirname, '../tools/make-thumbs.sh'), '--list'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const asked = JSON.parse(vm.runInContext("JSON.stringify(CATALOG.map(function (v) { return getPreloadPath(v.url).replace('preload/', ''); }))", t.ctx));
  assert.ok(asked.length > 0);
  assert.deepStrictEqual(asked, listed, 'the generator must cut exactly the files the player asks for');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); menuIndex = getVisibleMenuItems().findIndex(function (i) { return i.key === 'descriptionTimer'; }); settings.descriptionTimer = 15; menuChangeValue(1);", t.ctx);
  assert.strictEqual(t.ctx.settings.descriptionTimer, 1, 'a number past its max must wrap to its min');
  vm.runInContext("menuChangeValue(-1);", t.ctx);
  assert.strictEqual(t.ctx.settings.descriptionTimer, 15, 'a number below its min must wrap to its max');
  vm.runInContext("menuChangeValue(-1);", t.ctx);
  assert.strictEqual(t.ctx.settings.descriptionTimer, 14, 'a number inside its range moves by one step');
}

{
  const t = boot();
  vm.runInContext("CSS = { supports: function (prop) { return prop === 'backdrop-filter'; } }; renderMenu();", t.ctx);
  assert.ok(t.ctx.menuEl.classList.contains('blur'), 'a TV that supports backdrop-filter must get the blur class');
  vm.runInContext("CSS = { supports: function () { return false; } }; renderMenu();", t.ctx);
  assert.ok(!t.ctx.menuEl.classList.contains('blur'), 'a TV without backdrop-filter must fall back to the flat panel');
  vm.runInContext("CSS = undefined; renderMenu();", t.ctx);
  assert.ok(!t.ctx.menuEl.classList.contains('blur'), 'an engine without CSS.supports must not throw or blur');
}

{
  const t = boot();
  vm.runInContext("storageSet('aerial_settings', JSON.stringify({ videoOrder: 'backwards', menuTheme: 'neon', showDescription: false })); loadSettings();", t.ctx);
  assert.strictEqual(t.ctx.settings.videoOrder, 'shuffle', 'a stored order the menu does not offer must fall back to the default');
  assert.strictEqual(t.ctx.settings.menuTheme, 'dark', 'a stored theme the menu does not offer must fall back to the default');
  assert.strictEqual(t.ctx.settings.showDescription, false, 'a valid stored value must survive');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); menuIndex = getVisibleMenuItems().findIndex(function (i) { return i.key === 'menuTheme'; }); menuChangeValue(1);", t.ctx);
  assert.strictEqual(t.ctx.settings.menuTheme, 'light', 'the menu theme toggle must switch dark to light');
  assert.ok(t.ctx.menuEl.classList.contains('light'), 'the light theme must put the light class on the menu');
  vm.runInContext("menuChangeValue(1);", t.ctx);
  assert.ok(!t.ctx.menuEl.classList.contains('light'), 'switching back to dark must drop the light class');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); menuIndex = getVisibleMenuItems().findIndex(function (i) { return i.key === 'videoOrder'; }); settings.videoOrder = 'sequential'; menuChangeValue(1);", t.ctx);
  assert.strictEqual(t.ctx.settings.videoOrder, 'shuffle', 'a toggle past its last option must wrap to the first');
  vm.runInContext("menuChangeValue(-1);", t.ctx);
  assert.strictEqual(t.ctx.settings.videoOrder, 'sequential', 'a toggle before its first option must wrap to the last');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.devMode = true; menuIndex = getVisibleMenuItems().findIndex(function (i) { return i.key === 'customServerUrl'; });", t.ctx);
  t.ctx.prompt = () => '';
  const before = t.ctx.settings.customServerUrl;
  vm.runInContext("menuChangeValue(1);", t.ctx);
  assert.strictEqual(t.ctx.settings.customServerUrl, before, 'an empty prompt answer must leave the URL alone');
  assert.strictEqual(vm.runInContext('menuBusyKey', t.ctx), null, 'and must not start a connection test');
}

{
  const t = boot();
  vm.runInContext("telemetryConfig = { clientToken: 'tok' }; telemetryStarted = Date.now(); telemetryQueue = []; telemetryLog = [];", t.ctx);
  t.ctx.realTelemetry('playback_failure', { url: 'http://x/v.mov', reason: 'boom' });
  const queued = JSON.parse(vm.runInContext('JSON.stringify(telemetryQueue)', t.ctx));
  assert.strictEqual(queued.length, 1, 'an enabled client must queue the event');
  assert.strictEqual(queued[0].event, 'playback_failure');
  assert.strictEqual(queued[0].status, 'error', 'a playback failure must be marked as an error');
  assert.strictEqual(queued[0].url, 'http://x/v.mov', 'event fields must ride along in the payload');
  assert.strictEqual(queued[0].ddsource, 'tizen');
  const line = vm.runInContext('telemetryRecent(1)[0]', t.ctx);
  assert.ok(/playback_failure .*reason=boom/.test(line), 'the debug board line must carry the fields: ' + line);
}

{
  const t = boot();
  vm.runInContext("telemetryConfig = null; telemetryQueue = []; telemetryLog = [];", t.ctx);
  t.ctx.realTelemetry('app_start', {});
  assert.strictEqual(vm.runInContext('telemetryQueue.length', t.ctx), 0, 'without a client token nothing may be queued');
  assert.strictEqual(vm.runInContext('telemetryRecent(5).length', t.ctx), 1, 'but the debug board still records the event');
}

{
  const t = boot();
  vm.runInContext("telemetryConfig = { clientToken: 'tok' }; telemetryQueue = []; telemetryLog = [];", t.ctx);
  for (let i = 0; i < 50; i++) t.ctx.realTelemetry('e' + i, {});
  assert.strictEqual(vm.runInContext('telemetryQueue.length', t.ctx), 0, 'a full queue must flush');
}

{
  const t = boot({ main: true });
  t.advance(PRELOAD_FADE_MS);
  assert.ok(t.events.some(e => e[0] === 'app_start'), 'main.js must announce the start');
  assert.strictEqual(t.opened.length, 1, 'main.js must start one video');
  const calls = [];
  const avplay = t.ctx.webapis.avplay;
  t.ctx.avplay = avplay;
  let state = 'PLAYING';
  avplay.getState = () => state;
  avplay.pause = () => { calls.push('pause'); state = 'PAUSED'; };
  avplay.play = () => { calls.push('play'); state = 'PLAYING'; };
  t.press(10252);
  t.press(10252);
  t.press(19);
  t.press(415);
  assert.deepStrictEqual(calls, ['pause', 'play', 'pause', 'play'], 'transport keys must drive avplay');
  const before = t.opened.length;
  [417, 39, 427, 428].forEach(code => { t.press(code); t.advance(PRELOAD_FADE_MS); });
  assert.strictEqual(t.opened.length, before + 4, 'skip keys must each start a video');
  t.hide(true);
  t.hide(false);
  t.advance(PRELOAD_FADE_MS);
  assert.ok(t.opened.length > before + 4, 'coming back to the app must resume playback');
  t.press(13);
  assert.strictEqual(vm.runInContext('menuOpen', t.ctx), true, 'Enter opens the menu');
  const row = vm.runInContext('menuIndex', t.ctx);
  t.press(40);
  assert.notStrictEqual(vm.runInContext('menuIndex', t.ctx), row, 'Down moves the menu');
  t.press(38);
  t.press(37);
  t.press(39);
  t.press(10009);
  assert.strictEqual(vm.runInContext('menuOpen', t.ctx), false, 'Back closes the menu');
  let exited = false;
  t.ctx.tizen.application.getCurrentApplication = () => ({ exit: () => { exited = true; } });
  t.press(10009);
  assert.ok(exited, 'Back on the player exits the app');
  t.press(413);
}

{
  const t = boot({ main: true });
  const digits = [1, 2, 3, 4, 5];
  digits.forEach(d => t.press(48 + d));
  assert.strictEqual(vm.runInContext('settings.devMode', t.ctx), true, '12345 turns developer mode on');
  t.press(48);
  digits.forEach(d => t.press(96 + d));
  assert.strictEqual(vm.runInContext('settings.devMode', t.ctx), false, '12345 on the numpad turns it off');
}

{
  const t = boot({ extra: { AERIAL_LOCAL_SERVER: 'http://lan:8090' } });
  vm.runInContext('loadSettings()', t.ctx);
  assert.strictEqual(vm.runInContext('settings.customServerUrl', t.ctx), 'http://lan:8090', 'a shipped server address wins');
  assert.strictEqual(vm.runInContext('settings.customServerEnabled && settings.devMode', t.ctx), true);
}

{
  const sent = [];
  function Img() { Object.defineProperty(this, 'src', { set: v => { sent.push(v); } }); }
  const t = boot({ extra: { AERIAL_PROBE_URL: 'http://lan:8090', Image: Img } });
  t.ctx.realTelemetryProbe = vm.runInContext('telemetryProbe', t.ctx);
  vm.runInContext('telemetryProbe()', t.ctx);
  vm.runInContext("telemetryProbe('a=1')", t.ctx);
  assert.ok(/^http:\/\/lan:8090\/aerial-probe\.gif\?t=\d+$/.test(sent[0]), sent[0]);
  assert.strictEqual(sent[1], 'http://lan:8090/aerial-probe.gif?a=1');
  const none = boot();
  vm.runInContext('telemetryProbe()', none.ctx);
}

{
  const t = boot({ extra: { Image: function () { throw new Error('no img'); }, AERIAL_PROBE_URL: 'http://lan:8090' } });
  vm.runInContext('telemetryProbe()', t.ctx);
}

{
  const requests = [];
  function Xhr() { requests.push(this); this.open = (m, u) => { this.method = m; this.url = u; }; this.send = () => {}; }
  const t = boot({ extra: { XMLHttpRequest: Xhr, prompt: () => 'http://new:1', alert: m => alerts.push(m) } });
  const alerts = [];
  const item = "{ key: 'customServerUrl' }";
  vm.runInContext("menuChangeText(" + item + ", 'http://old')", t.ctx);
  assert.strictEqual(requests[0].method, 'HEAD');
  assert.ok(/^http:\/\/new:1\//.test(requests[0].url), requests[0].url);
  requests[0].status = 200;
  requests[0].onload();
  assert.strictEqual(vm.runInContext('settings.customServerUrl', t.ctx), 'http://new:1', 'a reachable server is saved');
  vm.runInContext("menuChangeText(" + item + ", 'http://old')", t.ctx);
  requests[1].status = 500;
  requests[1].onload();
  assert.strictEqual(alerts.length, 1, 'an error status is refused');
  vm.runInContext("menuChangeText(" + item + ", 'http://old')", t.ctx);
  requests[2].onerror();
  vm.runInContext("menuChangeText(" + item + ", 'http://old')", t.ctx);
  requests[3].ontimeout();
  assert.strictEqual(alerts.length, 3, 'errors and timeouts are refused');
  assert.strictEqual(vm.runInContext('settings.customServerUrl', t.ctx), 'http://new:1', 'a refused URL never replaces the saved one');
}

{
  const results = [];
  function Xhr() { this.open = () => { throw new Error('bad url'); }; }
  const t = boot({ extra: { XMLHttpRequest: Xhr } });
  t.ctx.report = ok => results.push(ok);
  vm.runInContext('testConnection("http://x", report)', t.ctx);
  assert.deepStrictEqual(results, [false], 'a throwing request reads as unreachable');
  const quiet = boot({ extra: { prompt: () => '' } });
  vm.runInContext("menuChangeText({ key: 'customServerUrl' }, 'http://old')", quiet.ctx);
  assert.strictEqual(vm.runInContext('menuBusyKey', quiet.ctx) || null, null, 'an empty prompt changes nothing');
}

{
  const fresh = boot({ main: true, fileContent: null });
  fresh.finishRead();
  assert.ok(fresh.events.some(e => e[0] === 'storage_restore_skipped' && e[1].reason === 'no file'), 'a first run restores nothing');
}

{
  const t = boot({ main: true, fileContent: '{}' });
  vm.runInContext('settingsTouched = true', t.ctx);
  t.finishRead();
  assert.ok(t.events.some(e => e[0] === 'storage_restore_skipped' && e[1].reason === 'viewer already navigated'), 'a viewer who already acted wins over the file');
}

{
  const t2 = boot({ main: true, fileContent: JSON.stringify({ aerial_settings: JSON.stringify({ videoOrder: 'sequential' }) }) });
  vm.runInContext('startupIndex = videoIndex', t2.ctx);
  t2.finishRead();
  assert.strictEqual(vm.runInContext('settings.videoOrder', t2.ctx), 'sequential', 'settings saved on disk are restored');
  const same = boot({ main: true, fileContent: '{}' });
  vm.runInContext('startupIndex = videoIndex', same.ctx);
  const playing = vm.runInContext('videoIndex', same.ctx);
  same.advance(PRELOAD_FADE_MS);
  const startedBefore = same.opened.length;
  same.finishRead();
  same.advance(PRELOAD_FADE_MS);
  assert.ok(same.events.some(e => e[0] === 'storage_restored' && e[1].index === playing), 'the restore reports the video already playing');
  assert.strictEqual(same.opened.length, startedBefore, 'a restore never restarts the video');
}

{
  const probe = boot({ main: true, fileContent: '{}' });
  const other = vm.runInContext('playlist.filter(i => i !== videoIndex)[0]', probe.ctx);
  const t = boot({ main: true, fileContent: JSON.stringify({ aerial_index: String(other) }) });
  vm.runInContext('startupIndex = videoIndex', t.ctx);
  t.finishRead();
  assert.strictEqual(vm.runInContext('videoIndex', t.ctx), other, 'the video saved on disk is restored when the start-up pick differs');
  const gone = boot({ main: true, fileContent: JSON.stringify({ aerial_index: '99999' }) });
  vm.runInContext('startupIndex = videoIndex', gone.ctx);
  const kept = vm.runInContext('videoIndex', gone.ctx);
  gone.finishRead();
  assert.strictEqual(vm.runInContext('videoIndex', gone.ctx), kept, 'a saved index outside the playlist is ignored');
}

{
  const urls = [];
  const sent = [];
  function Xhr() { this.open = (m, u) => urls.push(u); this.setRequestHeader = () => {}; this.send = b => sent.push(b); }
  const beacon = [];
  const t = boot({ extra: { XMLHttpRequest: Xhr, navigator: { sendBeacon: (u) => { beacon.push(u); return true; } }, AERIAL_TELEMETRY: { clientToken: 'tok', site: 'datadoghq.eu' } } });
  t.ctx.realTelemetry('e', {});
  vm.runInContext('telemetryFlush()', t.ctx);
  assert.ok(/^https:\/\/browser-intake-datadoghq\.eu\/api\/v2\/logs\?dd-api-key=tok/.test(beacon[0]), 'a regional site gets its own intake: ' + beacon[0]);
  assert.strictEqual(sent.length, 0, 'a beacon that works needs no XHR');
  t.ctx.navigator.sendBeacon = () => false;
  t.ctx.realTelemetry('e', {});
  vm.runInContext('telemetryFlush()', t.ctx);
  assert.strictEqual(sent.length, 1, 'a refused beacon falls back to XHR');
  t.ctx.navigator.sendBeacon = () => { throw new Error('x'); };
  t.ctx.realTelemetry('e', {});
  vm.runInContext('telemetryFlush()', t.ctx);
  assert.strictEqual(sent.length, 2, 'a throwing beacon falls back to XHR');
  t.ctx.XMLHttpRequest = function () { throw new Error('x'); };
  t.ctx.realTelemetry('e', {});
  vm.runInContext('telemetryFlush()', t.ctx);
  const plain = boot({ extra: { navigator: {}, XMLHttpRequest: Xhr, AERIAL_TELEMETRY: { clientToken: 'tok' } } });
  plain.ctx.realTelemetry('e', {});
  vm.runInContext('telemetryFlush()', plain.ctx);
  assert.ok(/browser-intake-datadoghq\.com/.test(urls[urls.length - 1]), 'the default site is datadoghq.com');
}

assert.throws(() => boot({ main: true, extra: { CATALOG: [] } }), /CATALOG is empty/, 'an empty catalog must stop the app loudly');

console.log('player tests passed');
