const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function load(extra) {
  const ctx = Object.assign({ setTimeout, clearTimeout }, extra);
  vm.createContext(ctx);
  for (const f of ['../demo/proxy.js', '../demo/keys.js', '../demo/avplay.js', '../demo/boot.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx);
  }
  return ctx;
}

function video() {
  const handlers = {};
  return {
    handlers,
    src: '',
    currentTime: 0,
    paused: false,
    addEventListener(name, fn) { handlers[name] = fn; },
    load() { this.loaded = true; },
    play() { return this.playResult; },
    pause() { this.paused = true; },
    removeAttribute(name) { this[name] = null; },
    playResult: Promise.resolve()
  };
}

function recorder() {
  const calls = [];
  const l = {};
  ['onbufferingstart', 'onbufferingcomplete', 'onstreamcompleted', 'onerror', 'oncurrentplaytime'].forEach(n => {
    l[n] = arg => calls.push(arg === undefined ? n : [n, arg]);
  });
  return { calls, l };
}

(async () => {
  const stubs = { H264_MAP: { 'http://a/x.mov': 'http://a/x.mp4' }, getPreloadPath: u => 'preload/' + u.slice(u.lastIndexOf('/') + 1) };
  const ctx = load({ document: { addEventListener() {}, getElementById: () => video() }, location: { protocol: 'http:', search: '' }, DEMO_PROXY: '', ...stubs });

  assert.strictEqual(ctx.simUseStills('https:', '', ''), true, 'https with no proxy plays stills');
  assert.strictEqual(ctx.simUseStills('https:', '', 'https://p'), false, 'https with a proxy plays video');
  assert.strictEqual(ctx.simUseStills('http:', '', ''), false, 'http plays video');
  assert.strictEqual(ctx.simUseStills('http:', '?stills', ''), true, '?stills forces stills');
  assert.strictEqual(ctx.simUseStills('http:', '?x=1&stills', ''), true);
  assert.strictEqual(ctx.simUseStills('http:', '?stillsx', ''), false, 'only the exact word counts');

  assert.strictEqual(ctx.simBrowserUrl('http://a/x.mov', 'http:', ''), 'http://a/x.mp4', 'the H264 variant replaces the HEVC url');
  assert.strictEqual(ctx.simBrowserUrl('http://a/y.mov', 'http:', ''), 'http://a/y.mov', 'an unmapped url passes through');
  assert.strictEqual(ctx.simBrowserUrl('http://sylvan.apple.com/y.mov', 'https:', 'https://p/'), 'https://p/y.mov', 'https goes through the proxy');

  const v = video();
  const p = ctx.simCreateAvplay(v, null, false, u => 'U:' + u);
  const r = recorder();
  p.setListener(r.l);
  assert.strictEqual(p.getState(), 'NONE');
  p.open('a');
  assert.strictEqual(v.src, 'U:a#t=1');
  assert.strictEqual(p.getState(), 'IDLE');
  let ready = 0;
  p.prepareAsync(() => ready++, () => assert.fail('no error expected'));
  assert.strictEqual(v.loaded, true);
  v.oncanplay();
  assert.strictEqual(ready, 1);
  assert.strictEqual(v.oncanplay, null, 'canplay fires once');
  assert.strictEqual(p.getState(), 'READY');
  p.play();
  assert.strictEqual(p.getState(), 'PLAYING');
  p.pause();
  assert.strictEqual(p.getState(), 'PAUSED');
  p.stop();
  assert.strictEqual(p.getState(), 'NONE');
  assert.strictEqual(v.src, null, 'stop drops the source');
  p.open('a');
  p.close();
  assert.strictEqual(p.getState(), 'NONE');
  p.setDisplayRect();
  p.setStreamingProperty();

  let failed = 0;
  p.prepareAsync(() => {}, () => failed++);
  v.onerror();
  assert.strictEqual(failed, 1, 'a load error reaches the caller');
  assert.strictEqual(v.onerror, null);
  p.prepareAsync(null, null);
  v.oncanplay();
  v.onerror();

  v.handlers.waiting();
  v.handlers.playing();
  v.handlers.ended();
  v.handlers.error();
  v.currentTime = 2.5;
  v.handlers.timeupdate();
  assert.deepStrictEqual(r.calls, ['onbufferingstart', 'onbufferingcomplete', 'onstreamcompleted', 'onerror', ['oncurrentplaytime', 2500]], 'video events reach the listener');

  v.playResult = Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
  r.calls.length = 0;
  p.play();
  await new Promise(res => setImmediate(res));
  assert.deepStrictEqual(r.calls, [], 'an aborted play is not an error');
  v.playResult = Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
  p.play();
  await new Promise(res => setImmediate(res));
  assert.deepStrictEqual(r.calls, ['onerror'], 'a refused play is an error');

  const v2 = video();
  const s = { src: '', complete: false, naturalWidth: 0 };
  const sp = ctx.simCreateAvplay(v2, s, true, u => u);
  const r2 = recorder();
  sp.setListener(r2.l);
  sp.open('http://a/x.mov');
  assert.strictEqual(s.src, 'preload/x.mov', 'the still is the preload thumbnail');
  let okCount = 0;
  let err = null;
  sp.prepareAsync(() => okCount++, e => { err = e; });
  s.onerror();
  assert.strictEqual(err, 'no thumbnail for this video');
  s.onload();
  assert.strictEqual(okCount, 1);
  assert.strictEqual(sp.getState(), 'READY');
  s.complete = true;
  s.naturalWidth = 10;
  sp.prepareAsync(() => okCount++, null);
  assert.strictEqual(okCount, 2, 'an already loaded still is ready at once');
  sp.prepareAsync(null, null);
  s.onerror();

  const timers = [];
  ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  ctx.clearTimeout = () => { timers.cleared = (timers.cleared || 0) + 1; };
  vm.runInContext('setTimeout = this.setTimeout; clearTimeout = this.clearTimeout;', ctx);
  const sp2 = ctx.simCreateAvplay(video(), { src: '' }, true, u => u);
  const r3 = recorder();
  sp2.setListener(r3.l);
  sp2.open('http://a/x.mov');
  sp2.play();
  assert.strictEqual(sp2.getState(), 'PLAYING');
  assert.deepStrictEqual(r3.calls, ['onbufferingcomplete'], 'the first play reports buffering done');
  assert.strictEqual(timers[0].ms, 8000, 'a still plays for eight seconds');
  sp2.pause();
  assert.strictEqual(sp2.getState(), 'PAUSED');
  sp2.play();
  assert.deepStrictEqual(r3.calls, ['onbufferingcomplete'], 'resuming does not report buffering again');
  timers[1].fn();
  assert.deepStrictEqual(r3.calls, ['onbufferingcomplete', 'onstreamcompleted'], 'the clip ends the stream');
  sp2.stop();
  assert.strictEqual(sp2.getState(), 'NONE');
  sp2.close();
  sp2.open('http://a/x.mov');
  sp2.play();
  assert.deepStrictEqual(r3.calls.slice(-1), ['onbufferingcomplete'], 'opening a new still reports buffering again');

  const body = { textContent: 'x', style: {} };
  const doc = { title: '', body };
  const tz = ctx.simCreateTizen(doc);
  tz.tvinputdevice.registerKey();
  tz.application.getCurrentApplication().exit();
  assert.strictEqual(doc.title, 'Aerial [exited]');
  assert.strictEqual(body.textContent, '');
  assert.strictEqual(body.style.background, '#000');

  const classes = new Set();
  const list = { classList: { contains: c => classes.has(c) } };
  const dispatched = [];
  class KeyboardEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  ctx.KeyboardEvent = KeyboardEvent;
  let toggled = 0;
  ctx.toggleCatalogList = () => toggled++;
  ctx.menuOpen = false;
  const d = { getElementById: id => (id === 'catalog-list' ? list : null), dispatchEvent: e => dispatched.push(e) };
  function key(keyCode, tagName) {
    const e = { keyCode, target: { tagName: tagName || 'BODY' }, log: [], preventDefault() { this.log.push('prevent'); }, stopImmediatePropagation() { this.log.push('stop'); } };
    ctx.simOnKeydown(e, d);
    return e.log;
  }
  assert.deepStrictEqual(key(13), [], 'Enter passes through to the app');
  assert.deepStrictEqual(key(32), ['prevent', 'stop']);
  assert.strictEqual(dispatched[0].keyCode, 10252, 'Space becomes PlayPause');
  assert.deepStrictEqual(key(27), ['prevent', 'stop']);
  assert.strictEqual(dispatched[1].keyCode, 13, 'Esc with the menu closed becomes Enter');
  ctx.menuOpen = true;
  key(27);
  assert.strictEqual(dispatched[2].keyCode, 10009, 'Esc with the menu open becomes Back');
  assert.deepStrictEqual(key(76), ['prevent', 'stop']);
  assert.strictEqual(toggled, 1, 'L toggles the list');
  classes.add('open');
  key(27);
  assert.strictEqual(toggled, 2, 'Esc closes an open list');
  assert.strictEqual(dispatched.length, 3, 'Esc on an open list does not reach the menu');
  assert.deepStrictEqual(key(65, 'INPUT'), ['stop'], 'typing in the filter is swallowed');

  let clickHandler;
  ctx.simWireCatalogButton({ getElementById: id => (id === 'catalog-button' ? { addEventListener: (type, fn) => { assert.strictEqual(type, 'click'); clickHandler = fn; } } : null) });
  clickHandler();
  assert.strictEqual(toggled, 3, 'the All videos button toggles the list without an inline handler');

  const keys = { classList: { add: c => classes.add('keys-' + c) } };
  ctx.simFadeKeys({ getElementById: () => keys });
  assert.ok(classes.has('keys-fade'), 'the key help fades');
  ctx.simFadeKeys({ getElementById: () => null });

  const listeners = [];
  const doc2 = { title: '', body, getElementById: () => video(), addEventListener: (n, fn, o) => listeners.push([n, o]) };
  load({ document: doc2, location: { protocol: 'http:', search: '' }, DEMO_PROXY: '', ...stubs });
  assert.deepStrictEqual(listeners.map(l => l[0]), ['keydown', 'keydown'], 'boot wires the key remap and the fade');

  console.log('avplay: all passed');
})().catch(e => { console.error(e); process.exit(1); });
