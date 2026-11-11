import { describe, expect, it } from 'vitest';
import { openCommand } from './open';

describe('openCommand', () => {
  const url = 'http://127.0.0.1:4173/';

  it.each([
    ['darwin', ['open', [url]]],
    ['win32', ['cmd', ['/c', 'start', '""', url]]],
    ['linux', ['xdg-open', [url]]],
    ['freebsd', ['xdg-open', [url]]],
  ] as const)('starts the browser on %s', (platform, expected) => {
    expect(openCommand(url, platform)).toEqual(expected);
  });
});
