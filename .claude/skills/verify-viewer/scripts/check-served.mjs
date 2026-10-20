#!/usr/bin/env node
// HTTP-level check of a running viewer (or of any server hosting a written report).
//   node check-served.mjs <base-url> [--expect-entries N] [--expect-needs-human N]
// Checks: the page carries the data block, every image URL in it is served as an
// image, files the manifests do not name are NOT served, traversal is refused.
import assert from 'node:assert/strict';

const [base, ...rest] = process.argv.slice(2);
if (!base) {
  console.error(
    'usage: check-served.mjs <base-url> [--expect-entries N] [--expect-needs-human N]',
  );
  process.exit(2);
}
const flag = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? undefined : Number(rest[i + 1]);
};
const url = (p) => new URL(p, base.endsWith('/') ? base : `${base}/`).href;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};
// fetch() normalizes `..`; a raw socket-level request keeps it
const rawStatus = async (rawPath) => {
  const { hostname, port } = new URL(base);
  const { connect } = await import('node:net');
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), hostname, () =>
      socket.write(
        `GET ${rawPath} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`,
      ),
    );
    let out = '';
    socket.on('data', (d) => (out += d));
    socket.on('end', () => resolve(Number(out.split(' ')[1])));
    socket.on('error', reject);
  });
};

let data;
await check('page: 200 html with the vrv-data block', async () => {
  const res = await fetch(url('/'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const html = await res.text();
  const m = html.match(
    /<script type="application\/json" id="vrv-data">([\s\S]*?)<\/script>/,
  );
  assert.ok(m, 'no <script id="vrv-data">');
  assert.ok(!m[1].includes('</script'), 'data not escaped for <script>');
  data = JSON.parse(m[1].replace(/\\u003c/gi, '<'));
  assert.ok(
    !/<!--vrv:/.test(html),
    'an unreplaced <!--vrv:...--> marker is left',
  );
});
if (!data) process.exit(1);

await check('data: expected counts', () => {
  const n = flag('--expect-entries');
  const h = flag('--expect-needs-human');
  if (n !== undefined) assert.equal(data.entries.length, n);
  if (h !== undefined)
    assert.equal(data.entries.filter((e) => e.needsHuman).length, h);
});
await check('images: every linked image is served as an image', async () => {
  const urls = data.entries
    .flatMap((e) => Object.values(e.images))
    .filter(Boolean);
  assert.ok(urls.length > 0, 'no images linked');
  for (const u of urls) {
    const res = await fetch(url(u));
    assert.equal(res.status, 200, u);
    assert.match(res.headers.get('content-type') ?? '', /^image\//, u);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', u);
  }
});
await check(
  'isolation: manifest and other run files are not reachable',
  async () => {
    for (const p of [
      '/visual-regression-manifest.json',
      '/e2e/pages.spec.ts',
      '/package.json',
    ]) {
      const res = await fetch(url(p));
      assert.ok(res.status === 404, `${p} -> ${res.status}`);
    }
  },
);
await check('isolation: path traversal is refused', async () => {
  for (const p of [
    '/../../../../etc/hosts',
    '/%2e%2e/%2e%2e/etc/hosts',
    '/..%2f..%2fetc/hosts',
  ]) {
    const status = await rawStatus(p);
    assert.ok([400, 403, 404].includes(status), `${p} -> ${status}`);
  }
});
