import http from 'http';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { png, tmpDir, writeFile } from '../__tests__/helpers';
import { startServer, type Server } from './serve';

let server: Server | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const base = { host: '127.0.0.1', port: 0, autoPort: false, live: false };

const request = (url: string, method = 'GET') =>
  new Promise<{ status: number; type?: string; body: Buffer }>(
    (resolve, reject) => {
      http
        .request(url, { method }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              type: res.headers['content-type'],
              body: Buffer.concat(chunks),
            }),
          );
        })
        .on('error', reject)
        .end();
    },
  );

/** Opens the event stream and resolves with what arrives until `until` matches. */
const events = (url: string, until: RegExp) =>
  new Promise<string>((resolve, reject) => {
    http
      .get(url, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
          if (until.test(text)) {
            res.destroy();
            resolve(text);
          }
        });
      })
      .on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET')
          reject(error);
      });
  });

describe('startServer with the page in memory', () => {
  it('serves the page and exactly the listed files', async () => {
    const root = await tmpDir();
    writeFile(path.join(root, 'a b.png'), png(2, 2));
    writeFile(path.join(root, 'secret.txt'), 'nope');
    server = await startServer({
      ...base,
      page: () => '<html>page</html>',
      files: new Map([['a b.png', path.join(root, 'a b.png')]]),
    });

    const page = await request(server.url);
    expect(page).toMatchObject({
      status: 200,
      type: 'text/html; charset=utf-8',
    });
    expect(page.body.toString()).toBe('<html>page</html>');
    expect((await request(`${server.url}index.html`)).status).toBe(200);

    const image = await request(`${server.url}a%20b.png`);
    expect(image).toMatchObject({ status: 200, type: 'image/png' });
    expect(image.body).toEqual(png(2, 2));

    expect((await request(`${server.url}secret.txt`)).status).toBe(404);
    expect((await request(`${server.url}..%2Fsecret.txt`)).status).toBe(404);
    expect((await request(`${server.url}%zz`)).status).toBe(400);
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const root = await tmpDir();
    writeFile(path.join(root, 'a.png'), png(2, 2));
    server = await startServer({
      ...base,
      page: () => 'page',
      files: new Map([['a.png', path.join(root, 'a.png')]]),
    });
    expect((await request(server.url, 'HEAD')).body).toHaveLength(0);
    expect((await request(`${server.url}a.png`, 'HEAD')).body).toHaveLength(0);
    expect((await request(server.url, 'POST')).status).toBe(405);
  });

  it('serves an unknown file type as binary', async () => {
    const root = await tmpDir();
    writeFile(path.join(root, 'a.bin'), 'x');
    server = await startServer({
      ...base,
      page: () => 'page',
      files: new Map([['a.bin', path.join(root, 'a.bin')]]),
    });
    expect((await request(`${server.url}a.bin`)).type).toBe(
      'application/octet-stream',
    );
  });

  it('reports a page that cannot be produced', async () => {
    server = await startServer({
      ...base,
      page: () => {
        throw new Error('gone');
      },
    });
    const res = await request(server.url);
    expect(res.status).toBe(500);
    expect(res.body.toString()).toContain('gone');
  });

  it('has no event stream unless live', async () => {
    server = await startServer({ ...base, page: () => '<body></body>' });
    expect((await request(`${server.url}__vrv/events`)).status).toBe(404);
    expect((await request(server.url)).body.toString()).not.toContain(
      'EventSource',
    );
  });
});

describe('startServer with a directory', () => {
  it('serves the files of the directory and reads the page on every request', async () => {
    const root = await tmpDir();
    writeFile(path.join(root, 'sub/a.png'), png(2, 2));
    let page = 'one';
    server = await startServer({ ...base, dir: root, page: () => page });
    expect((await request(`${server.url}sub/a.png`)).body).toEqual(png(2, 2));
    expect((await request(`${server.url}missing.png`)).status).toBe(404);
    expect((await request(server.url)).body.toString()).toBe('one');
    page = 'two';
    expect((await request(server.url)).body.toString()).toBe('two');
  });
});

describe('startServer live', () => {
  it('injects the client and pushes reloads', async () => {
    server = await startServer({
      ...base,
      live: true,
      page: () => '<body></body>',
    });
    expect((await request(server.url)).body.toString()).toContain(
      'EventSource',
    );
    const received = events(`${server.url}__vrv/events`, /event: reload/);
    await new Promise((r) => setTimeout(r, 50));
    server.reload();
    expect(await received).toContain('event: reload');
  });
});

describe('startServer ports', () => {
  it('takes the next port when allowed, and fails otherwise', async () => {
    server = await startServer({ ...base, page: () => 'a' });
    const taken = Number(new URL(server.url).port);
    const next = await startServer({
      ...base,
      port: taken,
      autoPort: true,
      page: () => 'b',
    });
    expect(Number(new URL(next.url).port)).toBeGreaterThan(taken);
    await next.close();
    await expect(
      startServer({ ...base, port: taken, page: () => 'c' }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('brackets IPv6 hosts in the URL', async () => {
    try {
      server = await startServer({ ...base, host: '::1', page: () => 'a' });
    } catch {
      return; // no IPv6 loopback on this machine
    }
    expect(server.url).toMatch(/^http:\/\/\[::1\]:\d+\/$/);
  });
});
