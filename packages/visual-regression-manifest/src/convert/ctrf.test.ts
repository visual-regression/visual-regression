import { describe, expect, it } from 'vitest';
// the CTRF schema is draft-07, which Ajv's default export speaks
import Ajv from 'ajv';
import ctrfSchema from '../../__tests__/ctrf.schema.json';
import { entry, manifest } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import {
  CTRF_SPEC_VERSION,
  fromCtrf,
  toCtrf,
  toCtrfStatus,
  type CtrfReport,
} from './ctrf';

// `format` keywords (date-time, uuid) need ajv-formats; the shape is what matters here
const ajv = new Ajv({ allErrors: true, validateFormats: false, strict: false });
const validCtrf = ajv.compile(ctrfSchema);

const expectValidCtrf = (report: CtrfReport) => {
  expect(validCtrf(report), JSON.stringify(validCtrf.errors, null, 2)).toBe(
    true,
  );
};

describe('toCtrfStatus', () => {
  it('fails what needs a human and passes what the run asked for', () => {
    expect(toCtrfStatus('passed')).toBe('passed');
    expect(toCtrfStatus('failed')).toBe('failed');
    expect(toCtrfStatus('missing-baseline')).toBe('failed');
    expect(toCtrfStatus('created')).toBe('passed');
    expect(toCtrfStatus('updated')).toBe('passed');
    expect(toCtrfStatus('approved')).toBe('passed');
  });
});

describe('toCtrf', () => {
  it('writes a valid CTRF report with one visual test per entry', () => {
    const source = manifest([
      entry(),
      entry({
        name: 'about_#0',
        status: 'created',
        duration: 1200,
        test: { filePath: 'cypress/e2e/about.cy.ts', titlePath: [], retry: 1 },
        images: {
          baseline: { path: 'shots/about_#0.png', width: 4, height: 4 },
          actual: { path: null },
          diff: { path: null },
        },
        hashes: { baseline: 'a'.repeat(64) },
        attachments: [
          { name: 'trace', contentType: 'application/zip', path: 'trace.zip' },
        ],
        target: { kind: 'mobile', device: { model: 'iPhone 16' } },
        extra: { storybook: { args: { dark: true } } },
        message: '',
      }),
    ]);
    const report = toCtrf(source, {
      reportId: '0f9a2b2e-1c8b-4b3e-9a6e-2f9a0f8a1b2c',
    });
    expectValidCtrf(report);

    expect(report).toMatchObject({
      reportFormat: 'CTRF',
      specVersion: CTRF_SPEC_VERSION,
      reportId: '0f9a2b2e-1c8b-4b3e-9a6e-2f9a0f8a1b2c',
      runId: '555',
      timestamp: source.updatedAt,
      generatedBy: '@pixsame/cypress-plugin-visual-regression-diff@4.3.0',
    });
    expect(report.results.tool).toEqual({
      name: '@pixsame/cypress-plugin-visual-regression-diff',
      version: '4.3.0',
    });
    expect(report.results.summary).toEqual({
      tests: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      pending: 0,
      other: 0,
      start: Date.parse(source.createdAt),
      stop: Date.parse(source.updatedAt),
      extra: { visualRegression: source.summary },
    });
    expect(report.results.environment).toEqual({
      repositoryName: 'o/r',
      repositoryUrl: 'https://github.com/o/r',
      commit: 'c'.repeat(40),
      buildId: '555',
      osPlatform: 'linux',
      osRelease: '6.8.0',
      extra: {
        visualRegression: {
          ci: {
            provider: 'github',
            ref: 'refs/pull/7/merge',
            pullRequest: source.ci?.pullRequest,
            runAttempt: '1',
            workspace: '/home/runner/work/r/r',
          },
          platform: { arch: 'x64' },
        },
      },
    });
    expect(report.results.extra).toEqual({
      visualRegression: {
        specVersion: source.specVersion,
        projectRoot: source.projectRoot,
        options: source.options,
        runner: source.runner,
      },
    });

    const [failed, created] = report.results.tests;
    expect(failed).toMatchObject({
      name: 'home_#0',
      status: 'failed',
      rawStatus: 'failed',
      duration: 0,
      type: 'visual',
      suite: ['home', 'renders'],
      filePath: 'cypress/e2e/home.cy.ts',
      message: source.entries[0].message,
      stop: Date.parse(source.entries[0].recordedAt),
      retries: 0,
      browser: 'electron 130',
    });
    expect(failed).not.toHaveProperty('start');
    expect(failed.attachments).toEqual([
      {
        name: 'baseline',
        contentType: 'image/png',
        path: 'cypress/e2e/__image_snapshots__/home_#0.png',
        extra: {
          visualRegression: {
            role: 'baseline',
            width: 10,
            height: 10,
            sha256: 'f'.repeat(64),
          },
        },
      },
      {
        name: 'actual',
        contentType: 'image/png',
        path: 'cypress/e2e/__image_snapshots__/home_#0.actual.png',
        extra: {
          visualRegression: {
            role: 'actual',
            width: 10,
            height: 10,
            sha256: '0'.repeat(64),
          },
        },
      },
      {
        name: 'diff',
        contentType: 'image/png',
        path: 'cypress/e2e/__image_snapshots__/home_#0.diff.png',
        extra: { visualRegression: { role: 'diff' } },
      },
    ]);
    expect(failed.extra).toEqual({
      visualRegression: {
        test: source.entries[0].test,
        status: 'failed',
        comparison: { diffRatio: 0.12, maxDiffRatio: 0.01 },
        images: source.entries[0].images,
        baselineWritten: false,
        recordedAt: source.entries[0].recordedAt,
        platform: source.entries[0].platform,
        viewport: { width: 1000, height: 660 },
        renderer: source.entries[0].renderer,
        hashes: source.entries[0].hashes,
      },
    });

    expect(created).toMatchObject({
      name: 'about_#0',
      status: 'passed',
      rawStatus: 'created',
      duration: 1200,
      start: Date.parse(source.entries[1].recordedAt) - 1200,
      stop: Date.parse(source.entries[1].recordedAt),
      retries: 1,
      device: 'iPhone 16',
      extra: {
        visualRegression: { status: 'created' },
        storybook: { args: { dark: true } },
      },
    });
    expect(created).not.toHaveProperty('suite');
    expect(created).not.toHaveProperty('message');
    expect(created.attachments).toEqual([
      {
        name: 'baseline',
        contentType: 'image/png',
        path: 'shots/about_#0.png',
        extra: {
          visualRegression: {
            role: 'baseline',
            width: 4,
            height: 4,
            sha256: 'a'.repeat(64),
          },
        },
      },
      { name: 'trace', contentType: 'application/zip', path: 'trace.zip' },
    ]);
  });

  it('leaves out what a manifest written outside CI does not have', () => {
    const source = manifest([], {
      ci: null,
      platform: { osPlatform: 'darwin', arch: 'arm64' },
      tool: { name: 'my-tool' },
      upload: { buildId: 'u1', url: 'https://x', level: 'images' },
      extra: { team: { owner: 'web' } },
    });
    const report = toCtrf(source, { generatedBy: 'custom' });
    expectValidCtrf(report);
    expect(report.generatedBy).toBe('custom');
    expect(report).not.toHaveProperty('runId');
    expect(report.results.environment).toEqual({
      osPlatform: 'darwin',
      extra: { visualRegression: { platform: { arch: 'arm64' } } },
    });
    expect(report.results.extra).toEqual({
      visualRegression: {
        specVersion: source.specVersion,
        projectRoot: source.projectRoot,
        options: source.options,
        runner: source.runner,
        upload: source.upload,
      },
      team: { owner: 'web' },
    });
  });

  it("turns a numeric build number into CTRF's integer and keeps the rest in extra", () => {
    const numeric = manifest([], {
      ci: { provider: 'github', buildNumber: '42', buildId: '1' },
    });
    expect(toCtrf(numeric).results.environment).toMatchObject({
      buildNumber: 42,
      buildId: '1',
      extra: {
        visualRegression: { ci: { provider: 'github', buildNumber: '42' } },
      },
    });
    const odd = manifest([], {
      ci: { provider: 'gitlab', buildNumber: 'build-7' },
    });
    expect(toCtrf(odd).results.environment).not.toHaveProperty('buildNumber');
    expectValidCtrf(toCtrf(odd));
  });
});

describe('fromCtrf', () => {
  it('round-trips a manifest through CTRF', () => {
    const source = manifest(
      [
        entry({
          attachments: [
            {
              name: 'video',
              contentType: 'video/webm',
              path: 'v.webm',
              extra: { player: { fps: 30 } },
            },
          ],
          extra: { storybook: { args: { dark: true } } },
          duration: 15,
        }),
        entry({
          name: 'zzz',
          status: 'missing-baseline',
          test: { filePath: 'a.cy.ts', titlePath: ['a'], retry: 0 },
          images: {
            baseline: { path: 'shots/zzz.png' },
            actual: { path: 'shots/zzz.actual.png', width: 1, height: 1 },
            diff: { path: null },
          },
          hashes: { actual: '1'.repeat(64) },
          renderer: undefined,
          platform: undefined,
          viewport: undefined,
        }),
      ],
      { extra: { team: { owner: 'web' } } },
    );
    const back = fromCtrf(toCtrf(source));
    expect(validateManifest(back)).toEqual([]);
    expect(back).toEqual({
      ...source,
      // sorted by test file, then name
      entries: [source.entries[1], source.entries[0]],
      summary: source.summary,
    });
  });

  it('rejects what is not a CTRF report and reports without a project root', () => {
    expect(() => fromCtrf({} as never)).toThrow(/Not a CTRF report/);
    expect(() =>
      fromCtrf({ reportFormat: 'CTRF', results: { tests: [] } } as never),
    ).toThrow(/pass `projectRoot`/);
  });

  it('skips tests without visual data unless lenient, then reads them from their attachments', () => {
    const report: CtrfReport = {
      reportFormat: 'CTRF',
      specVersion: '0.2.0',
      results: {
        tool: { name: 'some-reporter', version: '2' },
        summary: {
          tests: 3,
          passed: 1,
          failed: 2,
          skipped: 0,
          pending: 0,
          other: 0,
          start: 1700000000000,
          stop: 1700000060000,
        },
        environment: {
          buildId: '9',
          buildNumber: 3,
          repositoryName: 'o/r',
          osPlatform: 'linux',
        },
        tests: [
          { name: 'unit test', status: 'passed', duration: 1 },
          {
            name: 'header',
            status: 'failed',
            duration: 50,
            suite: ['home'],
            filePath: 'home.spec.ts',
            browser: 'chromium',
            stop: 1700000030000,
            attachments: [
              {
                name: 'header-expected.png',
                contentType: 'image/png',
                path: 'r/header-expected.png',
              },
              {
                name: 'header-actual.png',
                contentType: 'image/png',
                path: 'r/header-actual.png',
              },
              {
                name: 'header-diff.png',
                contentType: 'image/png',
                path: 'r/header-diff.png',
              },
              {
                name: 'trace.zip',
                contentType: 'application/zip',
                path: 'r/trace.zip',
              },
            ],
          },
          {
            name: 'footer',
            status: 'failed',
            rawStatus: 'missing-baseline',
            duration: 0,
            attachments: [
              {
                name: 'shot',
                contentType: 'image/png',
                path: 'r/footer.png',
                extra: {
                  visualRegression: { role: 'baseline', width: 2, height: 2 },
                },
              },
            ],
          },
        ],
      },
    };
    expect(() => fromCtrf(report)).toThrow(/projectRoot/);
    expect(fromCtrf(report, { projectRoot: '/p' }).entries).toEqual([]);

    const converted = fromCtrf(report, { projectRoot: '/p', lenient: true });
    expect(validateManifest(converted)).toEqual([]);
    expect(converted).toMatchObject({
      projectRoot: '/p',
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:14:20.000Z',
      platform: { osPlatform: 'linux', arch: '' },
      ci: {
        provider: null,
        buildId: '9',
        buildNumber: '3',
        repositoryName: 'o/r',
      },
      tool: { name: 'some-reporter', version: '2' },
      runner: { name: 'some-reporter' },
      summary: { entries: 2, failed: 1, missingBaseline: 1, needsHuman: 2 },
    });
    expect(converted.entries).toEqual([
      {
        name: 'footer',
        test: { filePath: '', titlePath: [], retry: 0 },
        status: 'missing-baseline',
        comparison: { diffRatio: 0 },
        images: {
          baseline: { path: 'r/footer.png', width: 2, height: 2 },
          actual: { path: null },
          diff: { path: null },
        },
        baselineWritten: false,
        recordedAt: '2023-11-14T22:14:20.000Z',
        message: '',
      },
      {
        name: 'header',
        test: { filePath: 'home.spec.ts', titlePath: ['home'], retry: 0 },
        status: 'failed',
        comparison: { diffRatio: 0 },
        images: {
          baseline: { path: 'r/header-expected.png' },
          actual: { path: 'r/header-actual.png' },
          diff: { path: 'r/header-diff.png' },
        },
        attachments: [
          {
            name: 'trace.zip',
            contentType: 'application/zip',
            path: 'r/trace.zip',
          },
        ],
        baselineWritten: false,
        recordedAt: '2023-11-14T22:13:50.000Z',
        duration: 50,
        platform: { osPlatform: '', browser: { name: 'chromium' } },
        message: '',
      },
    ]);
  });
});
