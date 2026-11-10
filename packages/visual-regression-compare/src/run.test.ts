import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, configArg } from './config';
import { runCli } from './run';
import { makePng } from './test-utils';

let dir: tmp.DirectoryResult;
beforeEach(async () => {
  dir = await tmp.dir({ unsafeCleanup: true });
});
afterEach(() => dir.cleanup());

const file = (...parts: string[]) => path.join(dir.path, ...parts);
const put = (name: string, bytes: Uint8Array | string) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), bytes);
};

const cli = async (...argv: string[]) => {
  const log: string[] = [];
  const error: string[] = [];
  const code = await runCli(argv, {
    log: (line) => void log.push(line),
    error: (line) => void error.push(line),
  });
  return { code, log: log.join('\n'), error: error.join('\n') };
};

describe('runCli', () => {
  it('prints help and the version', async () => {
    expect((await cli('--help')).log).toContain('visual-regression-compare');
    expect((await cli('--version')).log).toMatch(/\d+\.\d+\.\d+/);
  });

  it('compares folders: exit 1 on a failure, 0 once nothing fails', async () => {
    put('base/a.png', makePng(8, 8));
    put('in/a.png', makePng(8, 8, undefined, 2));
    const manifest = file('in/m.json');
    const failed = await cli(
      file('in'),
      '--baseline',
      file('base'),
      '--manifest',
      manifest,
      '--report',
      'console',
      '--concurrency',
      '1',
    );
    expect(failed.code).toBe(1);
    expect(failed.log).toContain('Manifest:');
    expect(fs.existsSync(file('base/a.diff.png'))).toBe(true);

    const approved = await cli('approve', '--manifest', manifest);
    expect(approved.code).toBe(0);
    expect(approved.log).toContain('Approved 1 screenshot');

    const again = await cli(
      file('in'),
      '--baseline',
      file('base'),
      '--manifest',
      manifest,
      '--concurrency',
      '1',
    );
    expect(again.code).toBe(0);
  });

  it('fails when there is nothing to compare', async () => {
    fs.mkdirSync(file('in'));
    const result = await cli(file('in'), '--baseline', file('base'));
    expect(result.code).toBe(1);
    expect(result.error).toContain('No images found');
  });

  it('record writes baselines and exits 0', async () => {
    put('in/a.png', makePng(4, 4));
    const result = await cli(
      'record',
      file('in'),
      '--baseline',
      file('base'),
      '--concurrency',
      '1',
    );
    expect(result.code).toBe(0);
    expect(fs.existsSync(file('base/a.png'))).toBe(true);
  });

  it('exit code 2 for usage errors and failures, 1 for unapproved entries', async () => {
    expect((await cli('--bogus')).code).toBe(2);
    expect((await cli('--bogus')).error).toContain('--help');
    const missing = await cli(file('nowhere'), '--baseline', file('base'));
    expect(missing).toMatchObject({ code: 2 });
    expect(missing.error).toContain('Error:');
    put('in/a.png', makePng(4, 4));
    await cli(
      file('in'),
      '--baseline',
      file('base'),
      '--manifest',
      file('m.json'),
      '--concurrency',
      '1',
    );
    const approve = await cli('approve', '--manifest', file('m.json'), 'ghost');
    expect(approve.code).toBe(1);
    expect(approve.error).toContain('No entry named "ghost"');
  });

  it('reads defaults from a config file', async () => {
    put('in/a.png', makePng(4, 4));
    put(
      'cfg.json',
      JSON.stringify({
        baselineDir: file('base'),
        onMissingBaseline: 'create',
      }),
    );
    const result = await cli(
      file('in'),
      '--config',
      file('cfg.json'),
      '--concurrency',
      '1',
    );
    expect(result.code).toBe(0);
    expect(fs.existsSync(file('base/a.png'))).toBe(true);
  });
});

describe('config', () => {
  it('finds the config file of the working directory, in either spelling', async () => {
    expect(await loadConfig(undefined, dir.path)).toEqual({});
    put('visual-regression.config.mjs', 'export default { engine: "x" };');
    expect(await loadConfig(undefined, dir.path)).toEqual({ engine: 'x' });
    await expect(loadConfig('missing.json', dir.path)).rejects.toThrow(
      /does not exist/,
    );
  });

  it('finds --config in the raw arguments', () => {
    expect(configArg(['a', '--config', 'c.json'])).toBe('c.json');
    expect(configArg(['--config=c.json'])).toBe('c.json');
    expect(configArg(['a'])).toBeUndefined();
  });
});
