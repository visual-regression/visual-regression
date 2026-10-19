import fs from 'fs';
import path from 'path';
import { loadRun } from './load';
import type { ViewerOptions } from './options';
import { renderPage } from './render';
import { startServer } from './serve';
import { readTemplate } from './template';
import { watchPaths } from './watch';
import { writeOutput } from './write';
import { openInput } from './zip';

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'];

export type Running = { url?: string; close: () => Promise<void> };

const serveRun = async (
  options: ViewerOptions,
  dir: string,
  log: (message: string) => void,
): Promise<Running> => {
  const build = () => {
    const template = readTemplate(options.template);
    const css = options.css ? fs.readFileSync(options.css, 'utf8') : undefined;
    const { data, files } = loadRun(dir, options.title);
    const html = renderPage({ template, data, title: options.title, css });
    return { data, files, html };
  };
  const { data, files, html } = build();

  const out = options.out && path.resolve(options.out);
  if (out) {
    writeOutput(out, html, files);
    log(`Wrote index.html and ${files.size} images to ${options.out}`);
  }
  if (!options.serve) return { close: async () => {} };

  const live = !!out && options.watch;
  const server = await startServer({
    host: options.host,
    port: options.port,
    autoPort: options.autoPort,
    live,
    files: out ? undefined : files,
    dir: out,
    // a written page is served from the disk, so an edit of it shows up
    page: out
      ? () => fs.readFileSync(path.join(out, 'index.html'), 'utf8')
      : () => html,
  });
  log(`Serving ${data.entries.length} screenshots at ${server.url}`);
  if (!LOOPBACK_HOSTS.includes(options.host)) {
    log(`Warning: ${options.host} is reachable from other machines`);
  }

  const inputs = [options.template, options.css]
    .filter((file): file is string => !!file)
    .map((file) => path.resolve(file));
  const watcher = live
    ? watchPaths([out, ...inputs], (changed) => {
        if (!inputs.some((file) => changed.has(file))) return server.reload();
        // the write below changes the output, which reloads the pages
        try {
          const next = build();
          writeOutput(out, next.html, next.files);
          log(`Rebuilt ${options.out}`);
        } catch (error) {
          log(`Rebuild failed: ${(error as Error).message}`);
        }
      })
    : undefined;
  if (watcher) {
    await watcher.ready;
    log(
      `Watching ${[options.out, ...inputs.map((file) => path.relative('.', file) || file)].join(', ')} for changes`,
    );
  }
  return {
    url: server.url,
    close: async () => {
      await watcher?.close();
      await server.close();
    },
  };
};

/**
 * Builds the page for the run in `options.dir` (a directory, or a zip that
 * is unpacked first), writes it when asked to, serves it unless told not to
 * and, when serving a written page, reloads open pages as the files in the
 * output change. An edit of the template or the stylesheet rebuilds the page
 * into the output first.
 */
export const main = async (
  options: ViewerOptions,
  log: (message: string) => void = console.log,
): Promise<Running> => {
  const input = openInput(options.dir);
  let running: Running;
  try {
    running = await serveRun(options, input.dir, log);
  } catch (error) {
    input.cleanup();
    throw error;
  }
  // without a server nothing reads the unpacked files after the output is written
  if (!running.url) input.cleanup();
  return {
    url: running.url,
    close: async () => {
      await running.close();
      input.cleanup();
    },
  };
};
