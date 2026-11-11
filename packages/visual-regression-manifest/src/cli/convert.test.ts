import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { TOOLS, UsageError, convertTool, type ConvertFlags } from './convert';

// the options keep the fixtures' manifests free of the CI of the machine running the test
const flags = (more: Partial<ConvertFlags> = {}): ConvertFlags => ({
  projectRoot: '.',
  options: { ci: null },
  ...more,
});

describe('convertTool', () => {
  // the tools whose captured output has no machine paths to fill in
  const cases = [
    ['backstopjs', 'backstopjs', 'test', {}],
    ['lost-pixel', 'lost-pixel', 'compare', {}],
    ['lost-pixel', 'lost-pixel', 'update', { update: true }],
    ['reg-cli', 'reg-cli', 'compare', {}],
    ['jest-image-snapshot', 'jest-image-snapshot', 'local', {}],
    ['vitest', 'vitest-browser', 'local', {}],
  ] as const;

  describe.each(cases)('%s', (tool, fixture, mode, more) => {
    const { root, expectations } = must(
      realOutput(fixture).find((output) => output.mode === mode),
    );

    it(`converts the real output of a ${fixture} ${mode} run from the project root`, () => {
      const manifest = convertTool(
        tool,
        flags({ ...more, projectRoot: root }),
        '/',
      );
      expect(validateManifest(manifest)).toEqual([]);
      expectRealOutput(manifest, root, expectations);
    });

    it('resolves the project root against the working directory', () => {
      const manifest = convertTool(
        tool,
        flags({ ...more, projectRoot: path.basename(root) }),
        path.dirname(root),
      );
      expect(manifest.projectRoot).toBe(root);
    });
  });

  it('reads a report from where it was typed, relative to the working directory', () => {
    const { root } = realOutput('reg-cli')[0];
    const manifest = convertTool(
      'reg-cli',
      flags({ projectRoot: root, input: 'reg.json' }),
      root,
    );
    expect(manifest.summary.entries).toBeGreaterThan(0);
  });

  it('passes the limits the tool takes on to the converter', async () => {
    const { root } = realOutput('jest-image-snapshot')[0];
    const manifest = convertTool(
      'jest-image-snapshot',
      flags({ projectRoot: root, maxDiffRatio: 0.01, colorThreshold: 0.2 }),
      '/',
    );
    expect(manifest.entries[0].comparison).toMatchObject({
      maxDiffRatio: 0.01,
      colorThreshold: 0.2,
    });
  });

  it('lets --options override and extend what the flags made', () => {
    const { root } = realOutput('lost-pixel')[0];
    const manifest = convertTool(
      'lost-pixel',
      flags({
        projectRoot: root,
        options: { ci: null, runner: { name: 'my-lost-pixel' } },
      }),
      '/',
    );
    expect(manifest.runner).toEqual({ name: 'my-lost-pixel' });
  });

  it('names the tools when asked for an unknown one', () => {
    expect(() => convertTool('percy', flags(), '/')).toThrow(
      new RegExp(`Unknown tool "percy".*${Object.keys(TOOLS)[0]}`),
    );
  });

  it('refuses a flag the tool does not take, and says which it takes', () => {
    expect(() => convertTool('loki', flags({ update: true }), '/')).toThrow(
      /--update does not apply to loki; it takes --configurations/,
    );
    expect(() =>
      convertTool('backstopjs', flags({ maxDiffRatio: 0.1 }), '/'),
    ).toThrow(/takes none of these/);
  });

  it('refuses a report for a tool that is read from the project', () => {
    expect(() =>
      convertTool('vitest', flags({ input: 'report.json' }), '/'),
    ).toThrow(UsageError);
  });

  it('needs the report of a tool with no conventional one', () => {
    expect(() => convertTool('playwright', flags(), '/')).toThrow(
      'playwright needs the path of its report',
    );
  });

  it('refuses a project root that is not a directory', () => {
    expect(() =>
      convertTool('vitest', flags({ projectRoot: 'missing' }), '/'),
    ).toThrow(/is not a directory/);
  });

  it('explains a report that is missing, is not JSON, or lies outside the project', async () => {
    const root = await tmpDir();
    await import('fs').then(({ default: fs }) =>
      fs.writeFileSync(path.join(root, 'broken.json'), '{'),
    );
    const run = (input: string, projectRoot = root) =>
      convertTool('playwright', flags({ projectRoot, input }), root);
    expect(() => run('gone.json')).toThrow(/Cannot read the report/);
    expect(() => run('broken.json')).toThrow(/is not valid JSON/);
    expect(() => run('../elsewhere.json')).toThrow(/outside the project root/);
  });
});
