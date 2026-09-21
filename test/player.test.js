const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function boot() {
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
    document: { getElementById: el, addEventListener() {}, createElement: makeEl, createTextNode: () => ({}) },
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
  vm.createContext(ctx);
  for (const f of ['storage', 'telemetry', 'settings', 'player', 'menu', 'debug']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx);
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
  return { ctx, opened, advance, events, elements, pending: () => timers.size, listener: () => listener };
}

const { PRELOAD_FADE_MS, BUFFER_TIMEOUT_MS, RETRY_DELAYS_MS } = boot().ctx;

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
  let readBack = null;
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
  let restored = null;
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

console.log('player tests passed');
