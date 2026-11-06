import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  fixtureJson,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import {
  fromCypressImageDiff,
  type CypressImageDiffReport,
} from './cypress-image-diff';

const REPORT = 'cypress/image-diff/cypress-image-diff-html-report/report.json';

describe('fromCypressImageDiff', () => {
  // captured by examples/converters/cypress (cypress-image-diff-js 2.8 on Cypress 16,
  // Electron): one run with FAIL_ON_MISSING_BASELINE, one without
  describe.each(
    realOutput('cypress').filter(({ mode }) => mode.startsWith('image-diff')),
  )('real output of a $mode run', ({ mode, root, expectations }) => {
    it('converts the JSON report, filling in the paths it leaves empty', () => {
      const report = fixtureJson<CypressImageDiffReport>(root, REPORT);
      const manifest = fromCypressImageDiff(report, {
        projectRoot: root,
        ci: null,
        colorThreshold: 0.1,
      });
      expectRealOutput(manifest, root, expectations);
      expect(manifest.runner).toEqual({ name: 'cypress', version: '16.2.0' });
      expect(manifest.createdAt).toBe(report.startedAt);
      const failed = must(
        manifest.entries.find((e) => e.name === 'box.cy-box-b'),
      );
      expect(failed).toMatchObject({
        status: 'failed',
        test: { filePath: 'cypress/e2e/image-diff/box.cy.js' },
        // the whole box is recolored: every pixel differs
        comparison: {
          diffRatio: 1,
          maxDiffRatio: 0,
          colorThreshold: 0.1,
          colorMetric: 'yiq',
        },
        images: {
          baseline: {
            path: 'cypress/image-diff/cypress-image-diff-screenshots/baseline/box.cy-box-b.png',
          },
          actual: {
            path: 'cypress/image-diff/cypress-image-diff-screenshots/comparison/box.cy-box-b.png',
          },
          diff: {
            path: 'cypress/image-diff/cypress-image-diff-screenshots/diff/box.cy-box-b.png',
          },
        },
        platform: { browser: { name: 'electron' } },
        extra: {
          cypressImageDiff: {
            percentage: 1,
            failureThreshold: 0,
            specFilename: 'box.cy.js',
          },
        },
      });
      const third = must(
        manifest.entries.find((e) => e.name === 'box.cy-box-c'),
      );
      if (mode === 'image-diff') {
        // the report has no baseline path and no percentage for it
        expect(third).toMatchObject({
          status: 'missing-baseline',
          message: 'Missing baseline image',
          comparison: { diffRatio: 0 },
          images: {
            baseline: {
              path: 'cypress/image-diff/cypress-image-diff-screenshots/baseline/box.cy-box-c.png',
            },
            actual: {
              path: 'cypress/image-diff/cypress-image-diff-screenshots/comparison/box.cy-box-c.png',
            },
            diff: { path: null },
          },
        });
      } else {
        expect(third.status).toBe('passed');
      }
    });
  });

  it('squares the plugin percentages into pixel shares and resolves paths against the report directory', async () => {
    const root = await tmpDir();
    const shots = path.join(root, 'e2e', 'cypress-image-diff-screenshots');
    writePng(path.join(shots, 'baseline', 'home.cy-hero.png'), 4, 4, 1);
    writePng(path.join(shots, 'comparison', 'home.cy-hero.png'), 4, 4, 2);
    writePng(path.join(shots, 'diff', 'home.cy-hero.png'), 4, 4, 3);
    writePng(path.join(shots, 'baseline', 'home.cy-footer.png'));
    writePng(path.join(shots, 'comparison', 'home.cy-footer.png'));
    const report: CypressImageDiffReport = {
      suites: [
        {
          name: 'home.cy.js',
          path: 'cypress/e2e/home.cy.js',
          tests: [
            {
              status: 'fail',
              name: 'home.cy-hero',
              percentage: 0.5,
              failureThreshold: 0.1,
              specFilename: 'home.cy.js',
              specPath: 'cypress/e2e/home.cy.js',
              baselinePath:
                'cypress-image-diff-screenshots/baseline/home.cy-hero.png',
              diffPath: 'cypress-image-diff-screenshots/diff/home.cy-hero.png',
              comparisonPath:
                'cypress-image-diff-screenshots/comparison/home.cy-hero.png',
            },
            {
              status: 'pass',
              name: 'home.cy-footer',
              percentage: 0.05,
              failureThreshold: 0.1,
              specPath: 'cypress/e2e/home.cy.js',
              baselinePath:
                'cypress-image-diff-screenshots/baseline/home.cy-footer.png',
              diffPath: '',
              comparisonPath:
                'cypress-image-diff-screenshots/comparison/home.cy-footer.png',
            },
          ],
        },
      ],
      browserName: 'chrome',
      browserVersion: '130',
      cypressVersion: '14.0.0',
    };
    const manifest = fromCypressImageDiff(report, {
      projectRoot: root,
      ci: null,
      reportDir: 'e2e',
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'cypress', version: '14.0.0' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.comparison,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
      ]),
    ).toEqual([
      [
        'home.cy-footer',
        'passed',
        {
          diffRatio: 0.0025000000000000005,
          maxDiffRatio: 0.010000000000000002,
        },
        'e2e/cypress-image-diff-screenshots/baseline/home.cy-footer.png',
        null,
        null,
      ],
      [
        'home.cy-hero',
        'failed',
        { diffRatio: 0.25, maxDiffRatio: 0.010000000000000002 },
        'e2e/cypress-image-diff-screenshots/baseline/home.cy-hero.png',
        'e2e/cypress-image-diff-screenshots/comparison/home.cy-hero.png',
        'e2e/cypress-image-diff-screenshots/diff/home.cy-hero.png',
      ],
    ]);
    expect(manifest.entries[1]).toMatchObject({
      message: 'Image difference 0.5 greater than threshold 0.1',
      platform: { browser: { name: 'chrome', version: '130' } },
      images: {
        baseline: { width: 4, height: 4 },
        actual: { width: 4, height: 4 },
      },
      extra: {
        cypressImageDiff: { percentage: 0.5, failureThreshold: 0.1 },
      },
    });
    expect(manifest.entries[1].comparison).not.toHaveProperty('colorThreshold');
  });

  it('falls back to the screenshots folder for an entry whose paths are all empty', async () => {
    const root = await tmpDir();
    const dir = path.join(root, 'shots');
    writePng(path.join(dir, 'comparison', 'new.png'));
    const report: CypressImageDiffReport = {
      suites: [
        {
          tests: [
            {
              status: 'fail',
              name: 'new',
              failureThreshold: 0,
              baselinePath: '',
              diffPath: '',
              comparisonPath: '',
            },
            { status: 'pass', name: '' },
          ],
        },
        { tests: undefined as never },
      ],
    };
    const manifest = fromCypressImageDiff(report, {
      projectRoot: root,
      ci: null,
      screenshotsDir: 'shots',
      runner: { name: 'cypress', version: '13' },
    });
    expect(manifest.runner).toEqual({ name: 'cypress', version: '13' });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      name: 'new',
      status: 'missing-baseline',
      test: { filePath: '' },
      images: {
        baseline: { path: 'shots/baseline/new.png' },
        actual: { path: 'shots/comparison/new.png' },
        diff: { path: null },
      },
    });
    expect(manifest.entries[0].platform).toBeUndefined();
  });

  it('rejects other JSON', async () => {
    const root = await tmpDir();
    expect(() =>
      fromCypressImageDiff({} as never, { projectRoot: root }),
    ).toThrow(/Not a cypress-image-diff-js JSON report/);
  });
});
