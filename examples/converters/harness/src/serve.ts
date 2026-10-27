import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export type StaticServer = { url: string; close: () => Promise<void> };

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

/** Serves the files below `dir` on a free local port, for tools that need an http URL. */
export const serveStatic = (dir: string) =>
  new Promise<StaticServer>((resolve) => {
    const root = path.resolve(dir);
    const server = http.createServer((req, res) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      const file = path.join(
        root,
        path.normalize(decodeURIComponent(pathname)),
      );
      if (
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader(
        'content-type',
        TYPES[path.extname(file)] ?? 'application/octet-stream',
      );
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
