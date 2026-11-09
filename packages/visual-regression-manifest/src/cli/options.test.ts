import { describe, expect, it } from 'vitest';
import { UsageError } from './convert';
import { helpText, parseCommand } from './options';

describe('parseCommand', () => {
  it('parses a tool, its report and every flag', () => {
    expect(
      parseCommand([
        'convert',
        'reg-cli',
        'out/reg.json',
        '-p',
        'app',
        '-o',
        'run',
        '--max-diff-ratio',
        '0.01',
        '--max-diff-pixels',
        '100',
        '--color-threshold',
        '0.2',
        '--update',
        '--lenient',
        '--configurations',
        'chrome.laptop, chrome.iphone7,',
        '--options',
        '{"actualDir":"a"}',
      ]),
    ).toEqual({
      kind: 'convert',
      tool: 'reg-cli',
      out: 'run',
      flags: {
        input: 'out/reg.json',
        projectRoot: 'app',
        maxDiffRatio: 0.01,
        maxDiffPixels: 100,
        colorThreshold: 0.2,
        update: true,
        lenient: true,
        configurations: ['chrome.laptop', 'chrome.iphone7'],
        options: { actualDir: 'a' },
      },
    });
  });

  it('defaults the project root to the working directory', () => {
    expect(parseCommand(['convert', 'vitest'])).toMatchObject({
      flags: { projectRoot: '.', input: undefined, options: undefined },
    });
  });

  it('answers --help and --version before checking anything else', () => {
    expect(parseCommand(['--help', 'nonsense'])).toEqual({ kind: 'help' });
    expect(parseCommand(['-v'])).toEqual({ kind: 'version' });
  });

  it.each([
    [[], /Expected a command: convert/],
    [['run'], /Unknown command "run"/],
    [['convert'], /convert needs a tool/],
    [['convert', 'vitest', 'a.json', 'b.json'], /Expected one report, got 2/],
    [['convert', 'vitest', '--max-diff-ratio', 'x'], /needs a number/],
    [['convert', 'vitest', '--max-diff-ratio', ''], /needs a number/],
    [
      ['convert', 'vitest', '--max-diff-pixels', '-1'],
      /needs a number|argument/,
    ],
    [['convert', 'vitest', '--options', '{'], /JSON object/],
    [['convert', 'vitest', '--options', '[]'], /JSON object/],
    [['convert', 'vitest', '--nope'], /nope/],
  ])('rejects %j', (argv, message) => {
    const run = () => parseCommand(argv);
    expect(run).toThrow(UsageError);
    expect(run).toThrow(message);
  });

  it('lists every tool in the help', () => {
    expect(helpText).toContain('backstopjs');
    expect(helpText).toContain('report (default reg.json)');
  });
});
