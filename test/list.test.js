// SPDX-FileCopyrightText: 2026 Jean
// SPDX-License-Identifier: MIT
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function node(tag) {
  const kids = [];
  const children = { get length() { return kids.length; }, item: i => kids[i] };
  return {
    tag,
    tagName: tag.toUpperCase(),
    kids,
    children,
    attrs: {},
    textContent: '',
    firstChild: null,
    open: false,
    appendChild(child) { kids.push(child); children[kids.length - 1] = child; this.firstChild = kids[0]; },
    setAttribute(k, v) { this.attrs[k] = v; },
    classList: { toggle() { panel.open = !panel.open; } }
  };
}

const panel = node('div');
const ctx = { document: { createElement: node, getElementById: () => panel } };
vm.createContext(ctx);
for (const f of ['../js/catalog.js', '../demo/list.js', '../demo/keys.js', '../demo/proxy.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx);
}
const catalog = vm.runInContext('CATALOG', ctx);

const played = [];
const root = ctx.buildCatalogList(catalog, ctx.document, i => played.push(i));
const links = root.kids.filter(c => c.tag === 'div').map(c => c.kids[1]);
assert.strictEqual(links.length, catalog.length, 'every catalog video gets a row');
links.forEach((link, i) => {
  assert.ok(catalog.some(v => v.url === link.attrs.href && v.label === link.textContent), 'row ' + i + ' links its own video');
  assert.strictEqual(link.attrs.rel, 'noopener noreferrer');
  assert.strictEqual(link.attrs.target, '_blank');
});
const headings = root.kids.filter(c => c.tag === 'h2').map(h => h.textContent);
assert.deepStrictEqual(headings, ['Space (22)', 'Sea (21)', 'Landscape (42)', 'Cityscape (30)'], 'rows are grouped by category with counts');

const rows = root.kids.filter(c => c.tag === 'div');
rows[0].kids[0].onclick();
assert.strictEqual(catalog[played[0]].url, rows[0].kids[1].attrs.href);
rows[catalog.length - 1].kids[0].onclick();
const lastUrl = rows[catalog.length - 1].kids[1].attrs.href;
assert.deepStrictEqual(played, [catalog.findIndex(v => v.url === catalog[0].url), catalog.findIndex(v => v.url === lastUrl)], 'Play starts that exact video in the demo');
assert.strictEqual(rows[5].kids[0].tag, 'button');

const search = root.kids[0];
search.value = 'AFRICA';
search.oninput();
const visible = rows.filter(r => !r.hidden);
assert.ok(visible.length > 0 && visible.length < catalog.length, 'a query narrows the list');
assert.ok(visible.every(r => r.searchText.indexOf('africa') >= 0), 'the filter ignores case and matches every shown row');
const shownHeadings = root.kids.filter(c => c.tag === 'h2' && !c.hidden);
assert.ok(shownHeadings.length < 4, 'a category with no match loses its heading');
search.value = 'zzzz-no-such-video';
search.oninput();
assert.strictEqual(rows.filter(r => !r.hidden).length, 0, 'a query with no match hides every row');
assert.strictEqual(root.kids.filter(c => c.tag === 'h2' && !c.hidden).length, 0);
search.value = '  ';
search.oninput();
assert.strictEqual(rows.filter(r => r.hidden).length, 0, 'a blank query shows everything again');

const hostile = ctx.buildCatalogList([{ url: 'http://x/a.mov', label: '<img src=x onerror=alert(1)>', description: '<b>d</b>', category: 'sea' }], ctx.document);
assert.strictEqual(hostile.kids[2].kids[1].textContent, '<img src=x onerror=alert(1)>', 'labels are set as text, never as markup');

const started = [];
ctx.playVideo = i => started.push(i);
ctx.toggleCatalogList();
assert.strictEqual(panel.open, true, 'the first toggle opens the list');
assert.strictEqual(panel.kids.length, 1, 'the list is built once on first open');
ctx.toggleCatalogList();
assert.strictEqual(panel.open, false);
assert.strictEqual(panel.kids.length, 1, 'closing and reopening does not rebuild it');

ctx.toggleCatalogList();
assert.strictEqual(panel.open, true);
panel.kids[0].kids.filter(c => c.tag === 'div')[7].kids[0].onclick();
assert.strictEqual(catalog[started[0]].url, panel.kids[0].kids.filter(c => c.tag === 'div')[7].kids[1].attrs.href);
assert.strictEqual(started.length, 1, 'Play in the opened list starts the video');
assert.strictEqual(panel.open, true, 'and leaves the side list open for the next pick');

const act = ctx.simKeyAction;
assert.strictEqual(act(32, 'BODY', false), 'playpause');
assert.strictEqual(act(27, 'BODY', false), 'back');
assert.strictEqual(act(39, 'BODY', false), 'pass', 'ordinary keys reach the player');
assert.strictEqual(act(76, 'BODY', false), 'toggle-list');
assert.strictEqual(act(76, 'BODY', true), 'toggle-list');
assert.strictEqual(act(27, 'BODY', true), 'close-list', 'Escape closes the list instead of exiting the app');
assert.strictEqual(act(13, 'BODY', true), 'swallow', 'Enter must not open the menu behind the list');
assert.strictEqual(act(76, 'INPUT', true), 'swallow', 'typing an L in the filter must not close the list');
assert.strictEqual(act(32, 'INPUT', true), 'swallow', 'typing a space must not pause the video');
assert.strictEqual(act(27, 'INPUT', true), 'close-list');

assert.strictEqual(ctx.simBackKey(false), 13, 'Escape on the main screen opens the settings menu');
assert.strictEqual(ctx.simBackKey(true), 10009, 'Escape in the menu closes it and never exits the demo');

const asset = 'http://sylvan.apple.com/Videos/a_2K_AVC.mov';
assert.strictEqual(ctx.simProxyUrl(asset, ''), asset, 'without a proxy the URL is untouched');
assert.strictEqual(ctx.simProxyUrl(asset, 'https://p.example'), 'https://p.example/Videos/a_2K_AVC.mov');
assert.strictEqual(ctx.simProxyUrl(asset, 'https://p.example/'), 'https://p.example/Videos/a_2K_AVC.mov', 'a trailing slash does not double up');
assert.strictEqual(ctx.simProxyUrl('http://other.example/a.mov', 'https://p.example'), 'http://other.example/a.mov', 'other hosts are never proxied');

console.log('list tests passed');
