const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function boot() {
  const timers = [];
  const opened = [];
  let listener = null;
  const el = () => ({ classList: { add() {}, remove() {} }, appendChild() {}, set textContent(v) {} });
  const ctx = {
    console,
    CATALOG: [0, 1, 2, 3, 4].map(i => ({ url: 'http://x/v' + i + '.mov', label: 'L' + i, description: '', category: i < 3 ? 'sea' : 'space' })),
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: el, addEventListener() {}, createElement: el, createTextNode() {} },
    Image: function () {},
    setTimeout: fn => timers.push(fn),
    clearTimeout() {},
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
  for (const f of ['settings', 'player', 'menu']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx);
  }
  const flush = () => { while (timers.length) timers.shift()(); };
  return { ctx, opened, flush, listener: () => listener };
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
  const prepared = [];
  t.ctx.webapis.avplay.prepareAsync = ok => prepared.push(ok);
  t.ctx.webapis.avplay.play = () => { throw new Error('InvalidStateError'); };
  vm.runInContext("loadSettings(); buildPlaylist(); playVideo(0);", t.ctx);
  t.flush();
  prepared[0]();
  assert.deepStrictEqual(t.opened, ['http://x/v0.mov', 'https://x/v0.mov'], 'a play() exception must fall back to the next URL');
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

console.log('player tests passed');
