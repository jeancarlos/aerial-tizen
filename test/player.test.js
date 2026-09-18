const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function boot() {
  const timers = new Map();
  let nextTimerId = 1;
  const opened = [];
  let listener = null;
  const el = () => ({ classList: { add() {}, remove() {} }, appendChild() {}, set textContent(v) {} });
  const ctx = {
    console,
    CATALOG: [0, 1, 2, 3, 4].map(i => ({ url: 'http://x/v' + i + '.mov', label: 'L' + i, description: '', category: i < 3 ? 'sea' : 'space' })),
    localStorage: (() => {
      const store = new Map();
      return { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    })(),
    document: { getElementById: el, addEventListener() {}, createElement: el, createTextNode() {} },
    Image: function () {},
    setTimeout: fn => { const id = nextTimerId++; timers.set(id, fn); return id; },
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
  for (const f of ['telemetry', 'settings', 'player', 'menu']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx);
  }
  const flush = () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  };
  const events = [];
  ctx.telemetry = (event, fields) => events.push([event, fields || {}]);
  return { ctx, opened, flush, events, listener: () => listener };
}

{
  const t = boot();
  vm.runInContext("loadSettings(); settings.videoOrder = 'sequential'; buildPlaylist(); playVideo(pickNext());", t.ctx);
  t.flush();
  for (let i = 0; i < 3; i++) t.listener().onbufferingcomplete();
  t.listener().onstreamcompleted();
  t.flush();
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v1.mov'], 'rebuffering must not skip videos in sequential order');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0); playVideo(1); playVideo(2);", t.ctx);
  t.flush();
  assert.deepStrictEqual(t.opened, ['http://x/v2.mov'], 'rapid skips must only start the last video');
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  t.listener().onbufferingcomplete();
  vm.runInContext("settings.category = 'space'; buildPlaylist(); playVideo(takeNext());", t.ctx);
  t.flush();
  assert.ok(['http://x/v3.mov', 'http://x/v4.mov'].includes(t.opened[1]), 'category change must drop the prefetched video');
}

{
  const t = boot();
  const stale = [];
  t.ctx.webapis.avplay.prepareAsync = (ok, fail) => stale.push(fail);
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  vm.runInContext("playVideo(1);", t.ctx);
  t.flush();
  stale[0]();
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v1.mov'], 'a stale prepare failure must not reopen the old video');
}

{
  const t = boot();
  const fails = [];
  t.ctx.webapis.avplay.prepareAsync = (ok, fail) => fails.push(fail);
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  for (let i = 0; i < 3; i++) { fails[fails.length - 1](); t.flush(); }
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
  t.flush();
  prepared[0]();
  t.flush();
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
  t.flush();
  t.flush();
  t.flush();
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'a stream that never reports buffering must be retried, not left hanging'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  t.listener().onbufferingcomplete();
  t.flush();
  t.flush();
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
  t.flush();
  const stale = t.listener();
  stale.onerror('first');
  stale.onerror('duplicate');
  t.flush();
  t.listener().onbufferingcomplete();
  stale.onerror('late');
  t.flush();
  t.flush();
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'http://x/v0.mov'], 'duplicate and stale errors must not retry the current stream');
}
{
  const t = boot();
  t.ctx.webapis.avplay.prepareAsync = () => {};
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  t.flush();
  t.flush();
  assert.deepStrictEqual(
    t.opened,
    ['http://x/v0.mov', 'http://x/v0.mov'],
    'a prepare that never calls back must time out and retry'
  );
}

{
  const t = boot();
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  t.listener().onbufferingcomplete();
  t.listener().onbufferingstart();
  t.flush();
  t.flush();
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
  t.flush();
  fails[0]();
  const failure = t.events.find(([e]) => e === 'avplay_failure' || e === 'watchdog_timeout');
  assert.ok(failure, 'a failed attempt must emit a telemetry event: ' + JSON.stringify(t.events));
  assert.strictEqual(failure[1].url, 'http://x/v0.mov', 'the event must name the URL that failed');
  assert.ok(failure[1].reason, 'the event must carry a reason');
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
  t.flush();
  const before = t.opened.length;
  vm.runInContext("applySetting('category', 'space');", t.ctx);
  t.flush();
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

console.log('player tests passed');
