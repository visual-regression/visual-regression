import { spawn } from 'child_process';

/** The command that opens `url` in the default browser on this platform. */
export const openCommand = (
  url: string,
  platform: NodeJS.Platform = process.platform,
): [string, string[]] => {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '""', url]];
  return ['xdg-open', [url]];
};

/** Opens `url` in the default browser; resolves `false` when there is none to start. */
export const openBrowser = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const [command, args] = openCommand(url);
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
