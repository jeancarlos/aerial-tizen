const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fc = require('fast-check');

function boot(stored) {
  const store = new Map([['aerial_settings', stored]]);
  const ctx = {
    console,
    CATALOG: [{ url: 'http://x/a.mov', label: 'A', description: '', category: 'sea' }],
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { getElementById: () => ({ classList: { add() {}, remove() {} } }), addEventListener() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    tizen: {},
  };
  vm.createContext(ctx);
  for (const f of ['storage', 'settings']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx);
  }
  return ctx;
}

const stored = fc.oneof(
  fc.string(),
  fc.json(),
  fc.record({
    descriptionTimer: fc.oneof(fc.integer(), fc.double({ noNaN: true }), fc.string(), fc.constant(null)),
    category: fc.oneof(fc.string(), fc.constantFrom('all', 'sea', 'space', 'cityscape'), fc.integer()),
    videoOrder: fc.oneof(fc.string(), fc.boolean()),
    showDescription: fc.oneof(fc.boolean(), fc.string()),
  }).map(JSON.stringify)
);

fc.assert(
  fc.property(stored, raw => {
    const ctx = boot(raw);
    vm.runInContext('loadSettings()', ctx);
    const s = JSON.parse(vm.runInContext('JSON.stringify(settings)', ctx));
    return (
      Number.isFinite(s.descriptionTimer) &&
      s.descriptionTimer >= 1 && s.descriptionTimer <= 15 &&
      ['all', 'sea'].includes(s.category) &&
      typeof s.showDescription === 'boolean' &&
      typeof s.videoOrder === 'string'
    );
  }),
  { numRuns: 2000 }
);

console.log('fuzz tests passed');
