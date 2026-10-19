import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_TITLE,
  UsageError,
  helpText,
  parseCommand,
} from './options';

const run = (...argv: string[]) => {
  const command = parseCommand(argv);
  if (command.kind !== 'run') throw new Error('expected a run command');
  return command.options;
};

describe('parseCommand', () => {
  it('serves the current directory by default', () => {
    expect(run()).toEqual({
      dir: '.',
      out: undefined,
      serve: true,
      watch: true,
      port: DEFAULT_PORT,
      autoPort: true,
      host: DEFAULT_HOST,
      template: undefined,
      css: undefined,
      title: DEFAULT_TITLE,
    });
  });

  it('reads the directory and every flag', () => {
    expect(
      run(
        'some/run',
        '-o',
        'report',
        '--no-watch',
        '--port',
        '8080',
        '--host',
        '0.0.0.0',
        '--template',
        't.html',
        '--css',
        's.css',
        '--title',
        'Mine',
      ),
    ).toMatchObject({
      dir: 'some/run',
      out: 'report',
      serve: true,
      watch: false,
      port: 8080,
      autoPort: false,
      host: '0.0.0.0',
      template: 't.html',
      css: 's.css',
      title: 'Mine',
    });
  });

  it('stops the server with --no-serve', () => {
    expect(run('run', '-o', 'report', '--no-serve')).toMatchObject({
      serve: false,
      out: 'report',
    });
  });

  it('rejects --no-serve without --out', () => {
    expect(() => parseCommand(['--no-serve'])).toThrow(UsageError);
  });

  it.each(['abc', '-1', '70000', '1.5'])('rejects the port %s', (port) => {
    expect(() => parseCommand([`--port=${port}`])).toThrow(/Invalid port/);
  });

  it('rejects unknown flags and extra directories', () => {
    expect(() => parseCommand(['--nope'])).toThrow(UsageError);
    expect(() => parseCommand(['a', 'b'])).toThrow(/one directory/);
  });

  it('recognises help and version', () => {
    expect(parseCommand(['--help'])).toEqual({ kind: 'help' });
    expect(parseCommand(['-h'])).toEqual({ kind: 'help' });
    expect(parseCommand(['-v'])).toEqual({ kind: 'version' });
    expect(helpText).toContain('--no-serve');
  });
});
