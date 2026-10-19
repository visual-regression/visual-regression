import fs from 'fs';
import http from 'http';
import path from 'path';
import sirv from 'sirv';
import { EVENTS_PATH, injectReload } from './render';

export type ServeOptions = {
  host: string;
  port: number;
  /** Try the next ports when `port` is taken; an explicitly chosen port fails instead. */
  autoPort: boolean;
  /** The page, asked for on every request so a rewritten `index.html` is served as it is. */
  page: () => string;
  /** Serve exactly these files (URL path to absolute path), nothing else: the page is only in memory. */
  files?: Map<string, string>;
  /** Serve this directory (the output directory). */
  dir?: string;
  /** Add the live-reload client to the page and offer `reload()`. */
  live: boolean;
};

export type Server = {
  url: string;
  /** Tells the open pages to reload. */
  reload: () => void;
  close: () => Promise<void>;
};

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const MAX_PORT_TRIES = 20;

const listen = (server: http.Server, port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

export const startServer = async (options: ServeOptions): Promise<Server> => {
  const { host, page, files, dir, live } = options;
  const clients = new Set<http.ServerResponse>();
  const serveDir = dir ? sirv(dir, { dev: true }) : undefined;

  const handler: http.RequestListener = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? '/', 'http://x').pathname,
      );
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    const rel = pathname.replace(/^\/+/, '');

    if (live && rel === EVENTS_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (rel === '' || rel === 'index.html') {
      let html: string;
      try {
        html = page();
      } catch (error) {
        res
          .writeHead(500)
          .end(`Cannot read the page: ${(error as Error).message}`);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(
        req.method === 'HEAD' ? undefined : live ? injectReload(html) : html,
      );
      return;
    }

    if (serveDir) {
      serveDir(req, res, () => {
        res.writeHead(404).end('Not found');
      });
      return;
    }
    const file = files?.get(rel);
    if (!file) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type':
        CONTENT_TYPES[path.extname(file).toLowerCase()] ??
        'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
  };

  const server = http.createServer(handler);
  let port = options.port;
  for (let attempt = 0; ; attempt++) {
    try {
      await listen(server, port, host);
      break;
    } catch (error) {
      const taken = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!taken || !options.autoPort || attempt >= MAX_PORT_TRIES) throw error;
      port++;
    }
  }
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;

  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${actual}/`,
    reload: () => {
      for (const client of clients) client.write('event: reload\ndata: 1\n\n');
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of clients) client.end();
        clients.clear();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
};
