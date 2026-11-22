// The export side: what `writeAllureResults` writes has to be a results folder the
// real Allure report generator accepts, with the image diff as an attachment it knows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ALLURE_IMAGE_DIFF_TYPE,
  fromImageTriples,
  writeAllureResults,
} from 'visual-regression-manifest';
import { encodePng } from '../src/png.js';
import { sh } from '../src/shell.js';

// the Allure command line is a dependency of the Playwright example
const example = path.resolve(import.meta.dirname, '../../playwright');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-allure-export-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

type ReportedTest = {
  name: string;
  status: string;
  labels: { name: string; value: string }[];
  attachments: { link: { contentType: string; missed: boolean } }[];
};

describe('allure export', () => {
  it('writes results that `allure generate` turns into a report with the image diffs', async () => {
    const write = (rel: string, fill: number) => {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, encodePng(8, 6, fill));
    };
    write('shots/box-a.png', 1);
    write('shots/box-b.png', 1);
    write('shots/box-b.actual.png', 2);
    write('shots/box-b.diff.png', 3);
    write('shots/box-c.actual.png', 2);
    const manifest = fromImageTriples({
      projectRoot: root,
      ci: null,
      runner: { name: 'harness' },
      triples: ['box-a', 'box-b', 'box-c'].map((name) => ({
        baseline: `shots/${name}.png`,
        testFile: 'tests/box.spec.mjs',
        titlePath: [name],
      })),
    });
    const results = path.join(root, 'allure-results');
    const warnings: string[] = [];
    writeAllureResults(results, manifest, {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings).toEqual([]);

    const report = path.join(root, 'allure-report');
    await sh('node_modules/.bin/allure', ['generate', results, '-o', report], {
      cwd: example,
    });

    const dir = path.join(report, 'data', 'test-results');
    const tests = fs
      .readdirSync(dir)
      .map(
        (file) =>
          JSON.parse(
            fs.readFileSync(path.join(dir, file), 'utf8'),
          ) as ReportedTest,
      )
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    const seen = tests.map(({ name, status, labels, attachments }) => ({
      name,
      status,
      manifestStatus: labels.find((l) => l.name === 'visualRegression.status')
        ?.value,
      attachments: attachments.map(({ link }) => link.contentType),
      missed: attachments.some(({ link }) => link.missed),
    }));
    expect(seen).toEqual([
      {
        name: 'box-a',
        status: 'passed',
        manifestStatus: 'passed',
        attachments: ['image/png'],
        missed: false,
      },
      {
        name: 'box-b',
        status: 'failed',
        manifestStatus: 'failed',
        attachments: [ALLURE_IMAGE_DIFF_TYPE],
        missed: false,
      },
      {
        name: 'box-c',
        status: 'failed',
        manifestStatus: 'missing-baseline',
        // no baseline: a diff with the actual image alone, as Allure adapters write it
        attachments: [ALLURE_IMAGE_DIFF_TYPE],
        missed: false,
      },
    ]);
  });
});
