import { describe, expect, it } from 'vitest';
import { UsageError, parseCommand } from './options';

const compare = (argv: string[], config = {}) => {
  const command = parseCommand(argv, config);
  if (command.kind !== 'compare') throw new Error('not a compare command');
  return command.options;
};

describe('parseCommand', () => {
  it('answers help and version before anything else', () => {
    expect(parseCommand(['--help'])).toEqual({ kind: 'help' });
    expect(parseCommand(['compare', '-v'])).toEqual({ kind: 'version' });
  });

  it('defaults to compare with the documented defaults', () => {
    expect(compare(['shots', '--baseline', 'base'])).toMatchObject({
      actualDir: 'shots',
      baselineDir: 'base',
      engine: 'pixelmatch',
      onMissingBaseline: 'fail',
      onSizeMismatch: 'fail',
      update: 'none',
      report: 'console',
      failOn: ['failed', 'missing-baseline'],
      record: false,
    });
  });

  it('reads every compare flag', () => {
    const options = compare([
      'compare',
      'shots',
      '--baseline=base',
      '--diff',
      'out',
      '--engine',
      './e.mjs',
      '--max-diff-ratio',
      '0.01',
      '--max-diff-pixels',
      '5',
      '--color-threshold',
      '0.3',
      '--include-aa',
      '--on-missing',
      'create',
      '--on-size-mismatch',
      'pad',
      '--update',
      'failures-only',
      '--match',
      '{path}-ref.png',
      '--manifest',
      'm.json',
      '--runner',
      'r',
      '--variant',
      'v',
      '--platform',
      'linux/chrome',
      '--report',
      'console,ctrf',
      '--concurrency',
      '2',
      '--fail-on',
      'failed,updated',
    ]);
    expect(options).toMatchObject({
      diffDir: 'out',
      engine: './e.mjs',
      engineOptions: { threshold: 0.3, includeAA: true },
      maxDiffRatio: 0.01,
      maxDiffPixels: 5,
      onMissingBaseline: 'create',
      onSizeMismatch: 'pad',
      update: 'failures-only',
      match: '{path}-ref.png',
      manifest: 'm.json',
      runner: 'r',
      variant: 'v',
      platform: 'linux/chrome',
      report: 'console,ctrf',
      concurrency: 2,
      failOn: ['failed', 'updated'],
    });
  });

  it('record creates and updates', () => {
    expect(compare(['record', 'shots', '--baseline', 'base'])).toMatchObject({
      onMissingBaseline: 'create',
      update: 'all',
      record: true,
    });
  });

  it('takes defaults from a config file; flags win', () => {
    const config = {
      actualDir: 'cfg-shots',
      baselineDir: 'cfg-base',
      onSizeMismatch: 'pad' as const,
      maxDiffRatio: 0.2,
      engineOptions: { threshold: 0.5 },
    };
    expect(compare([], config)).toMatchObject({
      actualDir: 'cfg-shots',
      baselineDir: 'cfg-base',
      onSizeMismatch: 'pad',
      maxDiffRatio: 0.2,
      engineOptions: { threshold: 0.5 },
    });
    expect(
      compare(['--max-diff-ratio', '0.3', '--color-threshold', '0.1'], config),
    ).toMatchObject({ maxDiffRatio: 0.3, engineOptions: { threshold: 0.1 } });
  });

  it('accepts the verb after the flags', () => {
    expect(
      parseCommand(['--manifest', 'a.json', 'approve', '--force']),
    ).toMatchObject({
      kind: 'approve',
      options: { manifests: ['a.json'], force: true },
    });
    expect(compare(['--baseline', 'b', 'record', 'shots'])).toMatchObject({
      actualDir: 'shots',
      record: true,
    });
  });

  it('validates values that come from the config file', () => {
    expect(() =>
      compare(['shots', '--baseline', 'b'], { onSizeMismatch: 'stretch' }),
    ).toThrow(UsageError);
    expect(() =>
      compare(['shots', '--baseline', 'b'], { update: 'sometimes' }),
    ).toThrow(UsageError);
  });

  it('parses approve', () => {
    expect(
      parseCommand([
        'approve',
        '--manifest',
        'a.json',
        '--manifest',
        'b.json',
        '--force',
      ]),
    ).toEqual({
      kind: 'approve',
      options: {
        manifests: ['a.json', 'b.json'],
        names: [],
        all: true,
        test: undefined,
        repoRoot: undefined,
        force: true,
        dryRun: false,
      },
    });
    expect(
      parseCommand(['approve', '--manifest', 'a.json', 'home', '--dry-run']),
    ).toMatchObject({
      options: { names: ['home'], all: false, dryRun: true },
    });
  });

  it.each([
    [['approve']],
    [[]],
    [['shots']],
    [['a', 'b', '--baseline', 'x']],
    [['shots', '--baseline', 'b', '--on-size-mismatch', 'stretch']],
    [['shots', '--baseline', 'b', '--max-diff-ratio', 'lots']],
    [['shots', '--baseline', 'b', '--fail-on', 'exploded']],
    [['shots', '--baseline', 'b', '--layout', 'playwright']],
    [['shots', '--nope']],
    [['shots', '--baseline', 'b', '--max-diff-ratio', '5']],
    [['shots', '--baseline', 'b', '--fail-on', '']],
    [
      [
        'shots',
        '--baseline',
        'b',
        '--manifest',
        'a.json',
        '--manifest',
        'b.json',
      ],
    ],
  ])('rejects %j', (argv) => {
    expect(() => parseCommand(argv)).toThrow(UsageError);
  });
});
