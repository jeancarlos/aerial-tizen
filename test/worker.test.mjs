import assert from 'assert';
import { makeHandler } from '../worker/index.mjs';

const calls = [];
const upstream = async (url, init) => {
  calls.push([url, init]);
  const partial = !!init.headers.range;
  return new Response(init.method === 'HEAD' ? null : 'bytes', {
    status: partial ? 206 : 200,
    headers: { 'content-type': 'video/quicktime', 'content-length': '5', 'accept-ranges': 'bytes', 'x-apple-request-uuid': 'secret', 'set-cookie': 'a=b' }
  });
};
const handle = makeHandler(upstream);
const PAGE = 'https://aerial.jeansouza.dev';
const FILE = 'https://p.example/Videos/AK_A004_C012_SDR_20191217_SDR_2K_AVC.mov';
const ask = (url, headers, method) => handle(new Request(url, { method: method || 'GET', headers }));

{
  const res = await ask(FILE, { origin: PAGE });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), 'bytes');
  assert.strictEqual(calls.at(-1)[0], 'http://sylvan.apple.com/Videos/AK_A004_C012_SDR_20191217_SDR_2K_AVC.mov', 'the file is fetched from Apple over http');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), PAGE, 'the page origin is echoed, never a wildcard');
  assert.strictEqual(res.headers.get('x-apple-request-uuid'), null, 'upstream headers are not passed through');
  assert.strictEqual(res.headers.get('set-cookie'), null);
  assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'the browser must not sniff the video into another type');
}

{
  const res = await ask(FILE, { referer: PAGE + '/aerial-tizen/' });
  assert.strictEqual(res.status, 200, 'a media element sends a Referer, not an Origin');
}

{
  const res = await ask(FILE, { origin: PAGE, range: 'bytes=0-1' });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(calls.at(-1)[1].headers.range, 'bytes=0-1', 'Range reaches Apple so seeking works');
}

{
  const before = calls.length;
  for (const headers of [{}, { origin: 'https://evil.example' }, { referer: 'https://evil.example/' }, { referer: 'not a url' }, { origin: PAGE + '.evil.example' }]) {
    const res = await ask(FILE, headers);
    assert.strictEqual(res.status, 403, 'only the demo origins may use the proxy: ' + JSON.stringify(headers));
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'refusals are not sniffed either');
  }
  assert.strictEqual(calls.length, before, 'a refused request never reaches Apple');
}

{
  const before = calls.length;
  for (const path of ['/', '/Videos/', '/Videos/a.txt', '/Videos/../etc/passwd.mov', '/other/a.mov', '/Videos/a/b.mov', '/Aerials/3x/Videos/a.mov']) {
    const res = await ask('https://p.example' + path, { origin: PAGE });
    assert.strictEqual(res.status, 404, 'only Apple video paths are proxied: ' + path);
  }
  assert.strictEqual(calls.length, before);
}

{
  const res = await ask('https://p.example/Aerials/2x/Videos/x_4K_HEVC.mov', { origin: PAGE });
  assert.strictEqual(res.status, 200, 'the 4K path is allowed too');
}

{
  const res = await ask(FILE, { origin: PAGE }, 'POST');
  assert.strictEqual(res.status, 405);
  const head = await ask(FILE, { origin: PAGE }, 'HEAD');
  assert.strictEqual(head.status, 200);
  const preflight = await ask(FILE, { origin: PAGE }, 'OPTIONS');
  assert.strictEqual(preflight.status, 204);
  assert.strictEqual(preflight.headers.get('access-control-allow-headers'), 'range');
}

{
  const down = makeHandler(async () => { throw new TypeError('network connection lost'); });
  const res = await down(new Request(FILE, { headers: { origin: PAGE } }));
  assert.strictEqual(res.status, 502, 'an unreachable upstream must answer 502, not crash the Worker');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), PAGE, 'the 502 must carry CORS so the player sees a status, not an opaque failure');
}

console.log('worker tests passed');
