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
import { fromBackstopReport, type BackstopReport } from './backstop';

describe('fromBackstopReport', () => {
  // captured by examples/converters/backstopjs: BackstopJS 6 with the puppeteer engine,
  // one reference run, one reference deleted, one test run with the JSON report
  describe.each(realOutput('backstopjs'))(
    'real output of a backstop $mode run',
    ({ root, expectations }) => {
      it('converts the JSON report, resolving its paths against json_report', () => {
        const report = fixtureJson<BackstopReport>(
          root,
          'backstop_data/json_report/jsonReport.json',
        );
        const manifest = fromBackstopReport(report, {
          projectRoot: root,
          ci: null,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'backstopjs' });
        const failed = must(
          manifest.entries.find((e) => e.status === 'failed'),
        );
        expect(failed).toMatchObject({
          name: 'e2e_box-b_0_box-b_0_phone',
          test: { titlePath: ['box-b', 'phone'] },
          variant: 'phone',
          comparison: { maxDiffRatio: 0 },
          images: {
            baseline: {
              path: 'backstop_data/bitmaps_reference/e2e_box-b_0_box-b_0_phone.png',
            },
            actual: {
              path: expect.stringMatching(
                /^backstop_data\/bitmaps_test\/\d{8}-\d{6}\/e2e_box-b_0_box-b_0_phone\.png$/,
              ),
            },
            diff: {
              path: expect.stringMatching(
                /\/failed_diff_e2e_box-b_0_box-b_0_phone\.png$/,
              ),
            },
          },
          subject: { kind: 'page' },
          extra: { backstop: { selector: '#box-b', label: 'box-b' } },
        });
        expect(failed.comparison.diffRatio).toBeGreaterThan(0);
        const missing = must(
          manifest.entries.find((e) => e.name === 'e2e_box-c_0_box-c_0_phone'),
        );
        expect(missing).toMatchObject({
          status: 'missing-baseline',
          message: expect.stringMatching(/reference file not found/i),
          images: { diff: { path: null } },
        });
      });
    },
  );

  it('converts the pairs of a JSON report, resolving paths against the report directory', async () => {
    const root = await tmpDir();
    const data = path.join(root, 'backstop_data');
    writePng(
      path.join(
        data,
        'bitmaps_reference',
        'backstop_default_Home_0_document_0_phone.png',
      ),
      3,
      3,
      1,
    );
    writePng(
      path.join(
        data,
        'bitmaps_test',
        '20260101-000000',
        'backstop_default_Home_0_document_0_phone.png',
      ),
      3,
      3,
      2,
    );
    writePng(
      path.join(
        data,
        'bitmaps_test',
        '20260101-000000',
        'failed_diff_backstop_default_Home_0_document_0_phone.png',
      ),
      3,
      3,
      3,
    );
    writePng(
      path.join(
        data,
        'bitmaps_reference',
        'backstop_default_Home_0_document_1_tablet.png',
      ),
    );
    writePng(
      path.join(
        data,
        'bitmaps_test',
        '20260101-000000',
        'backstop_default_Home_0_document_1_tablet.png',
      ),
    );
    writePng(
      path.join(
        data,
        'bitmaps_test',
        '20260101-000000',
        'backstop_default_About_0_document_0_phone.png',
      ),
    );

    const report: BackstopReport = {
      testSuite: 'BackstopJS',
      tests: [
        {
          pair: {
            reference:
              '../bitmaps_reference/backstop_default_Home_0_document_0_phone.png',
            test: '../bitmaps_test/20260101-000000/backstop_default_Home_0_document_0_phone.png',
            selector: 'document',
            fileName: 'backstop_default_Home_0_document_0_phone.png',
            label: 'Home',
            requireSameDimensions: true,
            misMatchThreshold: 0.1,
            url: 'https://example.test/',
            referenceUrl: '',
            expect: 0,
            viewportLabel: 'phone',
            diff: {
              isSameDimensions: true,
              dimensionDifference: { width: 0, height: 0 },
              rawMisMatchPercentage: 2.3456,
              misMatchPercentage: '2.35',
              analysisTime: 12,
            },
            diffImage:
              '../bitmaps_test/20260101-000000/failed_diff_backstop_default_Home_0_document_0_phone.png',
          },
          status: 'fail',
        },
        {
          pair: {
            reference:
              '../bitmaps_reference/backstop_default_Home_0_document_1_tablet.png',
            test: '../bitmaps_test/20260101-000000/backstop_default_Home_0_document_1_tablet.png',
            selector: 'document',
            fileName: 'backstop_default_Home_0_document_1_tablet.png',
            label: 'Home',
            misMatchThreshold: 0.1,
            url: 'https://example.test/',
            viewportLabel: 'tablet',
            diff: { isSameDimensions: true, misMatchPercentage: '0.00' },
          },
          status: 'pass',
        },
        {
          pair: {
            reference:
              '../bitmaps_reference/backstop_default_About_0_document_0_phone.png',
            test: '../bitmaps_test/20260101-000000/backstop_default_About_0_document_0_phone.png',
            fileName: 'backstop_default_About_0_document_0_phone.png',
            label: 'About',
            viewportLabel: 'phone',
            misMatchThreshold: 0.1,
            error:
              'Reference file not found /x/backstop_default_About_0_document_0_phone.png',
          },
          status: 'fail',
        },
      ],
    };

    const manifest = fromBackstopReport(report, {
      projectRoot: root,
      ci: null,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'backstopjs' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.test.titlePath,
        e.comparison,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
        e.variant,
      ]),
    ).toEqual([
      [
        'backstop_default_About_0_document_0_phone',
        'missing-baseline',
        ['About', 'phone'],
        { diffRatio: 0, maxDiffRatio: 0.001 },
        'backstop_data/bitmaps_reference/backstop_default_About_0_document_0_phone.png',
        'backstop_data/bitmaps_test/20260101-000000/backstop_default_About_0_document_0_phone.png',
        null,
        'phone',
      ],
      [
        'backstop_default_Home_0_document_0_phone',
        'failed',
        ['Home', 'phone'],
        { diffRatio: 0.0235, maxDiffRatio: 0.001 },
        'backstop_data/bitmaps_reference/backstop_default_Home_0_document_0_phone.png',
        'backstop_data/bitmaps_test/20260101-000000/backstop_default_Home_0_document_0_phone.png',
        'backstop_data/bitmaps_test/20260101-000000/failed_diff_backstop_default_Home_0_document_0_phone.png',
        'phone',
      ],
      [
        'backstop_default_Home_0_document_1_tablet',
        'passed',
        ['Home', 'tablet'],
        { diffRatio: 0, maxDiffRatio: 0.001 },
        'backstop_data/bitmaps_reference/backstop_default_Home_0_document_1_tablet.png',
        null,
        null,
        'tablet',
      ],
    ]);
    expect(manifest.entries[1]).toMatchObject({
      subject: { id: 'https://example.test/', kind: 'page' },
      extra: {
        backstop: {
          label: 'Home',
          viewportLabel: 'phone',
          selector: 'document',
          url: 'https://example.test/',
          expect: 0,
          requireSameDimensions: true,
          diff: { misMatchPercentage: '2.35' },
        },
      },
      images: {
        baseline: { width: 3, height: 3 },
        actual: { width: 3, height: 3 },
      },
    });
    expect(manifest.entries[0].message).toMatch(/Reference file not found/);
  });

  it('accepts an explicit report directory and rejects other JSON', async () => {
    const root = await tmpDir();
    const report: BackstopReport = {
      tests: [
        {
          pair: {
            reference: 'ref/a.png',
            test: 'test/a.png',
            fileName: 'a.png',
          },
          status: 'pass',
        },
        { pair: { reference: '', test: '' } },
      ],
    };
    const manifest = fromBackstopReport(report, {
      projectRoot: root,
      ci: null,
      reportDir: 'reports/backstop',
    });
    expect(manifest.entries.map((e) => e.images.baseline.path)).toEqual([
      'reports/backstop/ref/a.png',
    ]);
    expect(() =>
      fromBackstopReport({} as never, { projectRoot: root }),
    ).toThrow(/Not a BackstopJS JSON report/);
  });
});
