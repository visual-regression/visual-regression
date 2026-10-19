import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { png, tmpDir, writeFile, writeRun } from '../__tests__/helpers';
import { main, type Running } from './main';
import { DEFAULT_TITLE, type ViewerOptions } from './options';
import { DATA_MARKER } from './render';

const TEMPLATE = `<html><head><title>x</title></head><body>${DATA_MARKER}</body></html>`;

let running: Running | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

const options = async (overrides: Partial<ViewerOptions> = {}) => {
  const dir = await tmpDir();
  writeRun(dir);
  const template = path.join(await tmpDir(), 'template.html');
  writeFile(template, TEMPLATE);
  return {
    dir,
    serve: true,
    watch: true,
    port: 0,
    autoPort: false,
    host: '127.0.0.1',
    template,
    title: DEFAULT_TITLE,
    ...overrides,
  } satisfies ViewerOptions;
};

const get = (url: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });

/** Collects the event stream until the returned `stop` is called. */
const listen = (url: string) => {
  let text = '';
  const req = http.get(url, (res) => {
    res.setEncoding('utf8');
    res.on('data', (c) => (text += c));
  });
  req.on('error', () => {});
  return { text: () => text, stop: () => req.destroy() };
};

const until = async (check: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

const unpacked = () =>
  fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith('visual-regression-viewer-'));

/** The run `writeRun` writes, as a zip next to nothing else. */
const zipOf = async () => {
  const run = await tmpDir();
  writeRun(run);
  const files: Record<string, Uint8Array> = {};
  for (const rel of [
    'visual-regression-manifest.json',
    'shots/home.png',
    'shots/home.actual.png',
    'shots/home.diff.png',
  ]) {
    files[`artifact/${rel}`] = fs.readFileSync(path.join(run, rel));
  }
  return writeFile(
    path.join(await tmpDir(), 'artifact.zip'),
    Buffer.from(zipSync(files)),
  );
};

describe('main', () => {
  it('serves the page from memory and writes nothing by default', async () => {
    const opts = await options();
    const before = fs.readdirSync(opts.dir).sort();
    const log: string[] = [];
    running = await main(opts, (m) => log.push(m));

    const page = await get(running.url ?? '');
    expect(page.status).toBe(200);
    expect(page.body).toContain('id="vrv-data"');
    expect(page.body).not.toContain('EventSource');
    expect((await get(`${running.url}shots/home.png`)).status).toBe(200);
    expect(fs.readdirSync(opts.dir).sort()).toEqual(before);
    expect(log.join('\n')).toContain('Serving 1 screenshots');
  });

  it('warns when the server is reachable from other machines', async () => {
    const log: string[] = [];
    running = await main(await options({ host: '0.0.0.0' }), (m) =>
      log.push(m),
    );
    expect(log.join('\n')).toContain(
      '0.0.0.0 is reachable from other machines',
    );
    const quiet: string[] = [];
    await running.close();
    running = await main(await options(), (m) => quiet.push(m));
    expect(quiet.join('\n')).not.toContain('reachable');
  });

  it('applies the title and the stylesheet', async () => {
    const css = path.join(await tmpDir(), 'theme.css');
    writeFile(css, ':root{--vrv-accent:hotpink}');
    running = await main(await options({ title: 'Mine', css }));
    const page = (await get(running.url ?? '')).body;
    expect(page).toContain('<title>Mine</title>');
    expect(page).toContain('--vrv-accent:hotpink');
  });

  it('writes the page and images with -o, and serves them', async () => {
    const out = path.join(await tmpDir(), 'report');
    const log: string[] = [];
    running = await main(await options({ out }), (m) => log.push(m));
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'shots/home.png'))).toBe(true);
    expect((await get(`${running.url}shots/home.png`)).status).toBe(200);
    expect((await get(running.url ?? '')).body).toContain('EventSource');
    expect(log.join('\n')).toContain('Watching');
  });

  it('only writes with --no-serve', async () => {
    const out = path.join(await tmpDir(), 'report');
    running = await main(await options({ out, serve: false }));
    expect(running.url).toBeUndefined();
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
  });

  it('reloads open pages when the output changes', async () => {
    const out = path.join(await tmpDir(), 'report');
    running = await main(await options({ out }));
    const stream = listen(`${running.url}__vrv/events`);
    await until(() => stream.text().includes(': connected'));

    writeFile(path.join(out, 'shots/home.png'), png(3, 3));
    await until(() => stream.text().includes('event: reload'));
    stream.stop();
  });

  it('rebuilds the page when the stylesheet or the template changes', async () => {
    const opts = await options({
      out: path.join(await tmpDir(), 'report'),
      css: path.join(await tmpDir(), 'theme.css'),
    });
    writeFile(opts.css, ':root{--vrv-accent:red}');
    const log: string[] = [];
    running = await main(opts, (m) => log.push(m));
    const index = path.join(opts.out, 'index.html');
    expect(fs.readFileSync(index, 'utf8')).toContain('--vrv-accent:red');

    const stream = listen(`${running.url}__vrv/events`);
    await until(() => stream.text().includes(': connected'));
    writeFile(opts.css, ':root{--vrv-accent:blue}');
    await until(() => stream.text().includes('event: reload'));
    expect(fs.readFileSync(index, 'utf8')).toContain('--vrv-accent:blue');

    writeFile(opts.template, `<title>y</title>${DATA_MARKER}<p>edited</p>`);
    await until(() => fs.readFileSync(index, 'utf8').includes('<p>edited</p>'));
    stream.stop();
    expect(log.join('\n')).toContain('Rebuilt');
  });

  it('keeps running when a rebuild fails', async () => {
    const opts = await options({ out: path.join(await tmpDir(), 'report') });
    const log: string[] = [];
    running = await main(opts, (m) => log.push(m));
    writeFile(opts.template, '<html>no marker</html>');
    await until(() => log.some((m) => m.startsWith('Rebuild failed')));
    expect(log.join('\n')).toContain('vrv:data');
    expect((await get(running.url ?? '')).status).toBe(200);
  });

  it('does not rebuild on template edits with --no-watch', async () => {
    const opts = await options({
      out: path.join(await tmpDir(), 'report'),
      watch: false,
    });
    running = await main(opts);
    writeFile(opts.template, `${TEMPLATE}<p>edited</p>`);
    await new Promise((r) => setTimeout(r, 400));
    expect(
      fs.readFileSync(path.join(opts.out, 'index.html'), 'utf8'),
    ).not.toContain('edited');
  });

  it('serves a hand-edited page as it is on disk', async () => {
    const out = path.join(await tmpDir(), 'report');
    running = await main(await options({ out, watch: false }));
    fs.writeFileSync(path.join(out, 'index.html'), '<body>edited</body>');
    expect((await get(running.url ?? '')).body).toBe('<body>edited</body>');
  });

  it('reads a zip and removes what it unpacked when it stops', async () => {
    const before = unpacked();
    running = await main(await options({ dir: await zipOf() }));
    expect(unpacked()).toHaveLength(before.length + 1);
    const page = await get(running.url ?? '');
    expect(page.body).toContain(
      'shots/artifact/shots/home.png'.replace('shots/', ''),
    );
    expect((await get(`${running.url}artifact/shots/home.png`)).status).toBe(
      200,
    );
    await running.close();
    running = undefined;
    expect(unpacked()).toEqual(before);
  });

  it('writes a report from a zip with --no-serve and leaves nothing unpacked', async () => {
    const before = unpacked();
    const out = path.join(await tmpDir(), 'report');
    running = await main(
      await options({ dir: await zipOf(), out, serve: false }),
    );
    expect(fs.existsSync(path.join(out, 'artifact/shots/home.png'))).toBe(true);
    expect(unpacked()).toEqual(before);
  });

  it('does not leave a zip unpacked when the page cannot be built', async () => {
    const before = unpacked();
    await expect(
      main(await options({ dir: await zipOf(), css: '/nope/theme.css' })),
    ).rejects.toThrow(/ENOENT/);
    expect(unpacked()).toEqual(before);
  });

  it('does not watch with --no-watch', async () => {
    const out = path.join(await tmpDir(), 'report');
    const log: string[] = [];
    running = await main(await options({ out, watch: false }), (m) =>
      log.push(m),
    );
    expect(log.join('\n')).not.toContain('Watching');
    expect((await get(running.url ?? '')).body).not.toContain('EventSource');
    expect((await get(`${running.url}__vrv/events`)).status).toBe(404);
  });

  it('does not watch without an output directory', async () => {
    running = await main(await options());
    expect((await get(`${running.url}__vrv/events`)).status).toBe(404);
  });

  it('fails clearly for a run without manifests', async () => {
    const opts = await options({ dir: await tmpDir() });
    await expect(main(opts)).rejects.toThrow(/No visual-regression-manifest/);
  });

  it('fails for a missing stylesheet', async () => {
    await expect(
      main(await options({ css: '/nope/theme.css' })),
    ).rejects.toThrow(/ENOENT/);
  });
});
