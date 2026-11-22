import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  entry,
  expectRealOutput,
  manifest,
  must,
  png,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import type { ManifestEntry } from '../types';
import {
  ALLURE_IMAGE_DIFF_TYPE,
  ALLURE_STATUS_LABEL,
  fromAllureResults,
  toAllureResults,
  toAllureStatus,
  writeAllureResults,
  type AllureImageDiff,
  type AllureResult,
  type AllureResultsFile,
} from './allure';

const allureFixtures = realOutput('playwright').filter(({ mode }) =>
  mode.startsWith('allure-'),
);
const resultsDirOf = (mode: string) =>
  `test-results/${mode.replace(/^allure-/, '')}-reports/allure-results`;

/** A project with the images of `entry()` on disk, and its manifest. */
const project = async (
  entries: ManifestEntry[] = [entry()],
  written: ('baseline' | 'actual' | 'diff')[] = ['baseline', 'actual', 'diff'],
) => {
  const root = await tmpDir();
  entries.forEach((e, index) => {
    for (const role of written) {
      const file = e.images[role].path;
      if (file) writePng(path.join(root, file), 10, 10, index * 3 + 1);
    }
  });
  return { root, manifest: manifest(entries, { projectRoot: root }) };
};

const resultsOf = (files: AllureResultsFile[]) =>
  files
    .filter((file) => file.name.endsWith('-result.json'))
    .map((file) => JSON.parse(String(file.content)) as AllureResult);

const fileOf = (files: AllureResultsFile[], name: string) =>
  must(files.find((file) => file.name === name));

const dataUrl = (content: Buffer, type = 'image/png') =>
  `data:${type};base64,${content.toString('base64')}`;

/** Writes a results folder: results as given, image diffs from their payloads. */
const writeResults = (
  dir: string,
  results: Partial<AllureResult>[],
  payloads: Record<string, unknown> = {},
) => {
  fs.mkdirSync(dir, { recursive: true });
  results.forEach((result, index) => {
    const uuid = result.uuid ?? `r${index}`;
    fs.writeFileSync(
      path.join(dir, `${uuid}-result.json`),
      JSON.stringify({ uuid, name: `test ${index}`, ...result }),
    );
  });
  for (const [source, payload] of Object.entries(payloads)) {
    fs.writeFileSync(
      path.join(dir, source),
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    );
  }
};

const imageDiff = (source: string, name = source) => ({
  name,
  source,
  type: ALLURE_IMAGE_DIFF_TYPE,
});

describe('toAllureStatus', () => {
  it.each([
    ['failed', 'failed'],
    ['missing-baseline', 'failed'],
    ['passed', 'passed'],
    ['created', 'passed'],
    ['updated', 'passed'],
    ['approved', 'passed'],
  ] as const)('%s is %s', (status, expected) => {
    expect(toAllureStatus(status)).toBe(expected);
  });
});

describe('toAllureResults', () => {
  it('writes one test per entry with the three images in an image diff attachment', async () => {
    const { root, manifest: run } = await project([
      entry({ variant: 'iphone', duration: 250 }),
    ]);
    const files = toAllureResults(run);
    const [result] = resultsOf(files);

    expect(files).toHaveLength(2);
    expect(result).toMatchObject({
      name: 'home_#0',
      fullName: 'cypress/e2e/home.cy.ts#home renders home_#0',
      titlePath: ['cypress/e2e/home.cy.ts', 'home', 'renders'],
      status: 'failed',
      statusDetails: {
        message:
          'Image diff factor (12%) is bigger than maximum threshold option 1%.',
      },
      stage: 'finished',
      steps: [],
      links: [],
      start: Date.parse('2026-09-22T10:00:00.000Z') - 250,
      stop: Date.parse('2026-09-22T10:00:00.000Z'),
    });
    expect(result.uuid).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(result.historyId).toMatch(/^[0-9a-f]{32}$/);
    expect(result.labels).toEqual([
      { name: 'framework', value: 'cypress' },
      { name: 'parentSuite', value: 'cypress/e2e/home.cy.ts' },
      { name: 'suite', value: 'home' },
      { name: 'subSuite', value: 'renders' },
      { name: 'tag', value: 'visual' },
      { name: ALLURE_STATUS_LABEL, value: 'failed' },
    ]);
    expect(result.parameters).toEqual([
      { name: 'variant', value: 'iphone' },
      { name: 'browser', value: 'electron 130', excluded: true },
      { name: 'os', value: 'linux', excluded: true },
      { name: 'viewport', value: '1000x660', excluded: true },
      { name: 'diffRatio', value: '0.12', excluded: true },
      { name: 'maxDiffRatio', value: '0.01', excluded: true },
    ]);
    expect(result.attachments).toEqual([
      {
        name: 'home_#0',
        source: `${result.uuid}-attachment.imagediff`,
        type: ALLURE_IMAGE_DIFF_TYPE,
      },
    ]);

    const payload = JSON.parse(
      String(fileOf(files, `${result.uuid}-attachment.imagediff`).content),
    ) as AllureImageDiff;
    const image = (role: 'baseline' | 'actual' | 'diff') =>
      dataUrl(
        fs.readFileSync(
          path.join(root, must(run.entries[0].images[role].path)),
        ),
      );
    expect(payload).toEqual({
      expected: image('baseline'),
      actual: image('actual'),
      diff: image('diff'),
      name: 'home_#0',
    });
  });

  // captured by examples/converters/playwright from allure-playwright
  it.each(allureFixtures)(
    'writes the image diff the way allure-playwright does ($mode)',
    async ({ root, mode }) => {
      const dir = path.join(root, resultsDirOf(mode));
      const real = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('-result.json'))
        .map(
          (name) =>
            JSON.parse(
              fs.readFileSync(path.join(dir, name), 'utf8'),
            ) as AllureResult,
        )
        .flatMap((result) => result.attachments ?? [])
        .filter((attachment) => attachment.type === ALLURE_IMAGE_DIFF_TYPE);
      expect(real.length).toBeGreaterThan(0);
      const realKeys = new Set(
        real.flatMap((attachment) =>
          Object.keys(
            JSON.parse(
              fs.readFileSync(path.join(dir, attachment.source), 'utf8'),
            ),
          ),
        ),
      );

      const { manifest: run } = await project();
      const files = toAllureResults(run);
      const [mine] = must(resultsOf(files)[0].attachments);
      expect(path.extname(mine.source)).toBe(path.extname(real[0].source));
      const payload = JSON.parse(String(fileOf(files, mine.source).content));
      for (const key of Object.keys(payload)) expect(realKeys).toContain(key);
      expect(payload.expected).toMatch(/^data:image\/png;base64,/);
    },
  );

  it('writes a missing baseline as a diff with the actual image alone, a passed entry as its baseline', async () => {
    const missing = entry({
      name: 'new',
      status: 'missing-baseline',
      message: '',
      images: {
        baseline: { path: 'shots/new.png' },
        actual: { path: 'shots/new.actual.png', width: 10, height: 10 },
        diff: { path: null },
      },
    });
    const passed = entry({
      name: 'same',
      status: 'passed',
      images: {
        baseline: { path: 'shots/same.png', width: 10, height: 10 },
        actual: { path: null },
        diff: { path: null },
      },
    });
    const { root, manifest: run } = await project(
      [missing, passed],
      ['actual'],
    );
    writePng(path.join(root, 'shots/same.png'), 10, 10, 9);
    const warnings: string[] = [];
    const files = toAllureResults(run, { onWarning: (w) => warnings.push(w) });
    const [first, second] = resultsOf(files);

    expect(first).toMatchObject({ status: 'failed', statusDetails: {} });
    expect(first.attachments).toEqual([
      {
        name: 'new',
        source: `${first.uuid}-attachment.imagediff`,
        type: ALLURE_IMAGE_DIFF_TYPE,
      },
    ]);
    expect(
      JSON.parse(
        String(fileOf(files, `${first.uuid}-attachment.imagediff`).content),
      ),
    ).toEqual({
      actual: dataUrl(fs.readFileSync(path.join(root, 'shots/new.actual.png'))),
      name: 'new',
    });
    expect(second.status).toBe('passed');
    expect(second.attachments).toEqual([
      {
        name: 'baseline',
        source: `${second.uuid}-baseline-attachment.png`,
        type: 'image/png',
      },
    ]);
    expect(
      fileOf(files, `${second.uuid}-baseline-attachment.png`).content,
    ).toEqual(fs.readFileSync(path.join(root, 'shots/same.png')));
    // a baseline that is missing by definition is nothing to warn about
    expect(warnings).toEqual([]);
  });

  it('reads only regular image files that are really inside the project', async () => {
    const { root, manifest: run } = await project(
      [
        entry({
          images: {
            baseline: { path: 'shots/link.png' },
            actual: { path: 'shots/notes.txt' },
            diff: { path: 'shots/folder.png' },
          },
          attachments: [
            { name: 'out', contentType: 'text/plain', path: 'shots/out.txt' },
          ],
        }),
      ],
      [],
    );
    const outside = await tmpDir();
    writePng(path.join(outside, 'secret.png'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    fs.mkdirSync(path.join(root, 'shots/folder.png'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shots/notes.txt'), 'notes');
    fs.symlinkSync(
      path.join(outside, 'secret.png'),
      path.join(root, 'shots/link.png'),
    );
    fs.symlinkSync(
      path.join(outside, 'secret.txt'),
      path.join(root, 'shots/out.txt'),
    );
    const warnings: string[] = [];
    const files = toAllureResults(run, { onWarning: (w) => warnings.push(w) });

    expect(files).toHaveLength(1);
    expect(resultsOf(files)[0].attachments).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining(
        '"shots/link.png" could not be read (it is a link to a file outside the project)',
      ),
      expect.stringContaining('"shots/notes.txt" is not an image'),
      expect.stringContaining(
        '"shots/folder.png" could not be read (it is not a file)',
      ),
      expect.stringContaining(
        '"shots/out.txt" could not be read (it is a link to a file outside the project)',
      ),
    ]);
  });

  it('keeps the manifest status of a written baseline in the label', async () => {
    const { manifest: run } = await project([
      entry({ status: 'created', baselineWritten: true }),
    ]);
    const [result] = resultsOf(toAllureResults(run));
    expect(result.status).toBe('passed');
    expect(result.labels).toContainEqual({
      name: ALLURE_STATUS_LABEL,
      value: 'created',
    });
  });

  it('copies the other attachments of an entry', async () => {
    const { root, manifest: run } = await project([
      entry({
        attachments: [
          {
            name: 'trace',
            contentType: 'application/zip',
            path: 'out/trace.zip',
          },
          { name: 'gone', contentType: 'video/webm', path: 'out/gone.webm' },
        ],
      }),
    ]);
    fs.mkdirSync(path.join(root, 'out'));
    fs.writeFileSync(path.join(root, 'out/trace.zip'), 'zip');
    const warnings: string[] = [];
    const files = toAllureResults(run, { onWarning: (w) => warnings.push(w) });
    const [result] = resultsOf(files);

    expect(result.attachments?.[1]).toEqual({
      name: 'trace',
      source: `${result.uuid}-0-attachment.zip`,
      type: 'application/zip',
    });
    expect(
      String(fileOf(files, `${result.uuid}-0-attachment.zip`).content),
    ).toBe('zip');
    expect(result.attachments).toHaveLength(2);
    expect(warnings).toEqual([
      expect.stringContaining(
        'the attachment "gone" "out/gone.webm" could not be read',
      ),
    ]);
  });

  it('never reads a path that leaves the project', async () => {
    const { manifest: run } = await project([
      entry({
        images: {
          baseline: { path: '../outside.png' },
          actual: { path: '/etc/hosts' },
          diff: { path: null },
        },
      }),
    ]);
    const warnings: string[] = [];
    const files = toAllureResults(run, { onWarning: (w) => warnings.push(w) });
    expect(files).toHaveLength(1);
    expect(resultsOf(files)[0].attachments).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining(
        '"../outside.png" is not a path inside the project',
      ),
      expect.stringContaining('"/etc/hosts" is not a path inside the project'),
    ]);
  });

  it('reads the images from the given project root', async () => {
    const { root, manifest: run } = await project();
    const moved = { ...run, projectRoot: '/somewhere/else' };
    const warnings: string[] = [];
    expect(
      toAllureResults(moved, { onWarning: (w) => warnings.push(w) }),
    ).toHaveLength(1);
    expect(warnings).toHaveLength(3);
    expect(toAllureResults(moved, { projectRoot: root })).toHaveLength(2);
  });

  it('gives every entry its own files, the same ones on every export', async () => {
    const twice = [entry(), entry()];
    const { manifest: run } = await project(twice);
    const uuids = resultsOf(toAllureResults(run)).map((result) => result.uuid);
    expect(new Set(uuids).size).toBe(2);
    expect(resultsOf(toAllureResults(run)).map((r) => r.uuid)).toEqual(uuids);
  });

  it('writes an entry with no test, no platform and no time', async () => {
    const { manifest: run } = await project([
      entry({
        test: { filePath: '', titlePath: [], retry: 0 },
        platform: undefined,
        viewport: undefined,
        recordedAt: 'not a date',
        comparison: {
          diffRatio: 0.5,
          colorThreshold: 0.1,
          colorMetric: 'yiq',
        },
      }),
    ]);
    const [result] = resultsOf(toAllureResults(run));
    expect(result.fullName).toBe('home_#0');
    expect(result.titlePath).toEqual([]);
    expect(result).not.toHaveProperty('start');
    expect(result).not.toHaveProperty('stop');
    expect(result.labels).toEqual([
      { name: 'framework', value: 'cypress' },
      { name: 'tag', value: 'visual' },
      { name: ALLURE_STATUS_LABEL, value: 'failed' },
    ]);
    expect(result.parameters).toEqual([
      { name: 'diffRatio', value: '0.5', excluded: true },
      { name: 'colorThreshold', value: '0.1', excluded: true },
      { name: 'colorMetric', value: 'yiq', excluded: true },
    ]);
  });
});

describe('writeAllureResults', () => {
  it('writes the files into the folder, next to what is there', async () => {
    const { root, manifest: run } = await project();
    const dir = path.join(root, 'reports', 'allure-results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'other-result.json'), '{}');

    const written = writeAllureResults(dir, run);
    expect(written).toHaveLength(2);
    expect(writeAllureResults(dir, run)).toEqual(written);
    expect(fs.readdirSync(dir).sort()).toEqual(
      [
        'other-result.json',
        ...written.map((file) => path.basename(file)),
      ].sort(),
    );
  });

  it('exports a manifest that converts back with its statuses and numbers', async () => {
    const { root, manifest: run } = await project([
      entry({ variant: 'dark' }),
      entry({
        name: 'created',
        status: 'created',
        baselineWritten: true,
        comparison: { diffRatio: 0 },
        images: {
          baseline: { path: 'shots/created.png', width: 10, height: 10 },
          actual: { path: 'shots/created.actual.png', width: 10, height: 10 },
          diff: { path: null },
        },
      }),
    ]);
    writeAllureResults(path.join(root, 'allure-results'), run);
    const back = fromAllureResults({ projectRoot: root, ci: null });

    expect(validateManifest(back)).toEqual([]);
    expect(back.runner).toEqual({ name: 'cypress' });
    expect(
      back.entries.map(({ name, status, comparison, variant, test }) => ({
        name,
        status,
        comparison,
        variant,
        titlePath: test.titlePath,
      })),
    ).toEqual([
      {
        name: 'created',
        status: 'created',
        comparison: { diffRatio: 0 },
        variant: undefined,
        titlePath: ['cypress/e2e/home.cy.ts', 'home', 'renders', 'created'],
      },
      {
        name: 'home_#0',
        status: 'failed',
        comparison: { diffRatio: 0.12, maxDiffRatio: 0.01 },
        variant: 'dark',
        titlePath: ['cypress/e2e/home.cy.ts', 'home', 'renders', 'home_#0'],
      },
    ]);
    const failed = must(back.entries.find((e) => e.name === 'home_#0'));
    for (const role of ['baseline', 'actual', 'diff'] as const) {
      expect(
        fs.readFileSync(path.join(root, must(failed.images[role].path))),
      ).toEqual(
        fs.readFileSync(
          path.join(root, must(run.entries[0].images[role].path)),
        ),
      );
    }
  });
});

describe('fromAllureResults', () => {
  // captured by examples/converters/playwright: allure-playwright on toHaveScreenshot
  describe.each(allureFixtures)(
    'real output of allure-playwright, $mode',
    ({ mode, root, expectations }) => {
      // the converter writes the images out: work on a copy of the fixture
      const copy = async () => {
        const dir = await tmpDir();
        fs.cpSync(root, dir, { recursive: true });
        return dir;
      };

      it('converts the image diffs into entries with their images on disk', async () => {
        const dir = await copy();
        const run = fromAllureResults({
          projectRoot: dir,
          ci: null,
          resultsDir: resultsDirOf(mode),
          maxDiffPixels: 0,
        });
        expectRealOutput(run, dir, expectations);
        expect(run.runner).toEqual({ name: 'playwright' });
        const failed = must(run.entries.find((e) => e.name === 'box-b'));
        expect(failed).toMatchObject({
          test: {
            filePath: '',
            titlePath: ['chromium', 'box.spec.mjs', 'box-b'],
            retry: 0,
          },
          comparison: { diffRatio: 0, maxDiffRatio: 0 },
          variant: 'chromium',
          images: {
            baseline: { width: 80, height: 120 },
            actual: { width: 80, height: 120 },
          },
          extra: {
            allure: { status: 'failed', fullName: 'box.spec.mjs › box-b' },
          },
        });
        expect(failed.message).toContain('toHaveScreenshot');
        expect(failed.images.baseline.path).toMatch(
          new RegExp(
            `^${resultsDirOf(mode)}/visual-regression-images/[0-9a-f-]+-attachment\\.imagediff-expected\\.png$`,
          ),
        );
        expect(failed.duration).toBeGreaterThan(0);
      });

      it('writes the images once', async () => {
        const dir = await copy();
        const options = {
          projectRoot: dir,
          ci: null,
          resultsDir: resultsDirOf(mode),
        };
        const first = fromAllureResults(options);
        const image = path.join(dir, must(first.entries[0].images.actual.path));
        const written = fs.statSync(image).mtimeMs;
        fs.utimesSync(image, new Date(0), new Date(0));
        expect(fromAllureResults(options).entries).toEqual(first.entries);
        expect(fs.statSync(image).mtimeMs).toBeLessThan(written);
      });
    },
  );

  const one = png(4, 2, 1);
  const two = png(4, 2, 2);
  const three = png(4, 2, 3);
  const full = {
    expected: dataUrl(one),
    actual: dataUrl(two),
    diff: dataUrl(three),
  };

  it('reads the status from which images a diff holds and from the test', async () => {
    const root = await tmpDir();
    writeResults(
      path.join(root, 'allure-results'),
      [
        {
          name: 'differs',
          status: 'broken',
          attachments: [imageDiff('a.imagediff')],
        },
        {
          name: 'same',
          status: 'passed',
          attachments: [imageDiff('b.imagediff')],
        },
        {
          name: 'new',
          status: 'failed',
          attachments: [imageDiff('c.imagediff')],
        },
        {
          name: 'kept',
          status: 'passed',
          attachments: [imageDiff('d.imagediff')],
        },
        {
          name: 'accepted',
          status: 'passed',
          labels: [{ name: ALLURE_STATUS_LABEL, value: 'approved' }],
          attachments: [imageDiff('e.imagediff')],
        },
        {
          name: 'odd label',
          status: 'failed',
          labels: [{ name: ALLURE_STATUS_LABEL, value: 'nonsense' }],
          attachments: [imageDiff('f.imagediff')],
        },
        {
          name: 'lost its actual',
          status: 'failed',
          attachments: [imageDiff('g.imagediff')],
        },
      ],
      {
        'a.imagediff': { ...full, name: 'differs.png' },
        'b.imagediff': full,
        'c.imagediff': { actual: dataUrl(two) },
        'd.imagediff': { expected: dataUrl(one) },
        'e.imagediff': full,
        'f.imagediff': full,
        'g.imagediff': { expected: dataUrl(one) },
      },
    );
    const run = fromAllureResults({ projectRoot: root, ci: null });

    expect(validateManifest(run)).toEqual([]);
    expect(run.runner).toEqual({ name: 'allure' });
    expect(
      Object.fromEntries(run.entries.map((e) => [e.name, e.status])),
    ).toEqual({
      'differs.png': 'failed',
      'b.imagediff': 'passed',
      'c.imagediff': 'missing-baseline',
      'd.imagediff': 'passed',
      'e.imagediff': 'approved',
      'f.imagediff': 'failed',
      'g.imagediff': 'failed',
    });
    // a passed entry lists no actual and no diff image, so none is written
    expect(
      fs
        .readdirSync(path.join(root, 'allure-results/visual-regression-images'))
        .filter((file) => file.startsWith('b.imagediff')),
    ).toEqual(['b.imagediff-expected.png']);
    const differs = must(run.entries.find((e) => e.name === 'differs.png'));
    expect(differs.images).toEqual({
      baseline: {
        path: 'allure-results/visual-regression-images/a.imagediff-expected.png',
        width: 4,
        height: 2,
      },
      actual: {
        path: 'allure-results/visual-regression-images/a.imagediff-actual.png',
        width: 4,
        height: 2,
      },
      diff: {
        path: 'allure-results/visual-regression-images/a.imagediff-diff.png',
      },
    });
    expect(
      fs.readFileSync(path.join(root, must(differs.images.diff.path))),
    ).toEqual(three);
    const fresh = must(
      run.entries.find((e) => e.status === 'missing-baseline'),
    );
    expect(fs.existsSync(path.join(root, fresh.images.baseline.path))).toBe(
      false,
    );
    expect(fresh.images.diff.path).toBeNull();
  });

  it('finds image diffs inside steps and names an entry after the test as a last resort', async () => {
    const root = await tmpDir();
    writeResults(
      path.join(root, 'out'),
      [
        {
          name: 'checkout',
          status: 'failed',
          start: 1_000,
          stop: 1_500,
          labels: [
            { name: 'framework', value: 'junit5' },
            { name: 'suite', value: 'CheckoutTest' },
          ],
          parameters: [
            { name: 'browser', value: 'firefox' },
            { name: 'locale', value: 'pl' },
            { name: 'token', value: 'secret', mode: 'masked' },
            { name: 'run', value: '7', excluded: true },
            { name: 'diffRatio', value: '0.25' },
            { name: 'maxDiffRatio', value: 'lots', excluded: true },
          ],
          steps: [
            {
              name: 'compare',
              steps: [
                { attachments: [{ ...imageDiff('x.imagediff'), name: '' }] },
              ],
            },
          ],
        },
      ],
      { 'x.imagediff': full },
    );
    const run = fromAllureResults({
      projectRoot: root,
      ci: null,
      resultsDir: 'out',
      imagesDir: 'shots',
      maxDiffRatio: 0.1,
      colorThreshold: 0.2,
      colorMetric: 'yiq',
    });

    expect(run.runner).toEqual({ name: 'junit5' });
    expect(run.entries).toHaveLength(1);
    expect(run.entries[0]).toMatchObject({
      name: 'checkout',
      test: { titlePath: ['CheckoutTest', 'checkout'], retry: 0 },
      comparison: {
        diffRatio: 0.25,
        maxDiffRatio: 0.1,
        colorThreshold: 0.2,
        colorMetric: 'yiq',
      },
      variant: 'firefox-pl',
      recordedAt: new Date(1_500).toISOString(),
      duration: 500,
      images: { baseline: { path: 'shots/x.imagediff-expected.png' } },
    });
  });

  it('converts only the last attempt of a retried test, and keeps the tests around it', async () => {
    const root = await tmpDir();
    const labels = [{ name: 'suite', value: 'home' }];
    writeResults(
      path.join(root, 'allure-results'),
      [
        {
          uuid: 'first',
          name: 'renders',
          historyId: 'h:chromium',
          start: 10,
          labels,
          parameters: [{ name: 'Project', value: 'chromium' }],
          attachments: [imageDiff('first.imagediff', 'home')],
        },
        {
          uuid: 'second',
          name: 'renders',
          historyId: 'h:chromium',
          start: 20,
          labels,
          parameters: [{ name: 'Project', value: 'chromium' }],
          attachments: [imageDiff('second.imagediff', 'home')],
        },
        {
          uuid: 'other',
          name: 'renders',
          historyId: 'h:firefox',
          start: 5,
          labels,
          parameters: [{ name: 'Project', value: 'firefox' }],
          attachments: [imageDiff('other.imagediff', 'home')],
        },
      ],
      {
        'first.imagediff': full,
        'second.imagediff': full,
        'other.imagediff': full,
      },
    );
    const run = fromAllureResults({ projectRoot: root, ci: null });

    expect(
      run.entries.map((e) => [e.variant, e.test.retry, e.extra?.allure.uuid]),
    ).toEqual(
      expect.arrayContaining([
        ['chromium', 1, 'second'],
        ['firefox', 0, 'other'],
      ]),
    );
    expect(run.entries).toHaveLength(2);
  });

  it('leaves out what it cannot read, with a warning', async () => {
    const root = await tmpDir();
    const dir = path.join(root, 'allure-results');
    writeResults(
      dir,
      [
        {
          name: 'bad diffs',
          status: 'failed',
          attachments: [
            imageDiff('../secret.imagediff'),
            imageDiff('missing.imagediff'),
            imageDiff('text.imagediff'),
            imageDiff('empty.imagediff'),
            imageDiff('not-images.imagediff'),
            { name: 'log', source: 'log.txt', type: 'text/plain' },
            imageDiff('jpeg.imagediff'),
          ],
        },
      ],
      {
        'text.imagediff': '"just a string"',
        'empty.imagediff': { name: 'box' },
        'not-images.imagediff': {
          expected: 'data:text/plain;base64,aGk=',
          actual: 'https://example.com/a.png',
          diff: 42,
        },
        'jpeg.imagediff': {
          expected: dataUrl(Buffer.from('jpeg'), 'image/jpeg'),
          actual: 'data:image/jpg,%FF%D8raw',
          diff: 'data:image/svg+xml,%3Csvg/%3E',
        },
      },
    );
    fs.writeFileSync(path.join(dir, 'broken-result.json'), '{');
    fs.writeFileSync(path.join(dir, 'list-result.json'), '[]');
    fs.writeFileSync(path.join(dir, 'nameless-result.json'), '{"uuid":"x"}');
    const warnings: string[] = [];
    const run = fromAllureResults({
      projectRoot: root,
      ci: null,
      onWarning: (w) => warnings.push(w),
    });

    expect(run.entries.map((e) => e.name)).toEqual(['jpeg.imagediff']);
    expect(run.entries[0].images).toEqual({
      baseline: {
        path: 'allure-results/visual-regression-images/jpeg.imagediff-expected.jpg',
      },
      actual: {
        path: 'allure-results/visual-regression-images/jpeg.imagediff-actual.jpg',
      },
      diff: { path: null },
    });
    expect(warnings).toEqual([
      'broken-result.json is not an Allure result and was left out',
      'list-result.json is not an Allure result and was left out',
      'nameless-result.json is not an Allure result and was left out',
      expect.stringContaining('"../secret.imagediff" is not a file name'),
      expect.stringContaining('missing.imagediff could not be read'),
      expect.stringContaining('text.imagediff could not be read'),
    ]);
  });

  it('survives results whose fields are not what they should be', async () => {
    const root = await tmpDir();
    // every result has an image diff of its own, as real results do
    let count = 0;
    const own = () => [imageDiff(`ok${count++}.imagediff`)];
    writeResults(
      path.join(root, 'allure-results'),
      [
        { name: 'labels object', labels: {}, attachments: own() },
        { name: 'null label', labels: [null], attachments: own() },
        {
          name: 'number parameter',
          parameters: [{ name: 'diffRatio', value: 0.5 }],
          attachments: own(),
        },
        { name: 'odd times', start: 'abc', stop: 1e20, attachments: own() },
        { name: 'attachments object', attachments: {} },
        { name: 'steps string', steps: 'x', attachments: own() },
        {
          name: 'no source',
          attachments: [{ type: ALLURE_IMAGE_DIFF_TYPE, source: 123 }],
        },
        {
          name: 'odd names',
          statusDetails: { message: 5 },
          attachments: [{ ...imageDiff('named.imagediff'), name: { x: 1 } }],
        },
        {
          name: 'colors',
          statusDetails: { message: '\u001b[31mred\u001b[39m' },
          attachments: own(),
        },
      ] as unknown as Partial<AllureResult>[],
      {
        ...Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [`ok${i}.imagediff`, full]),
        ),
        'named.imagediff': { ...full, name: 7 },
      },
    );
    const run = fromAllureResults({ projectRoot: root, ci: null });

    expect(validateManifest(run)).toEqual([]);
    // every result is a test of its own: none has a history id or a full name
    expect(run.entries.map((e) => e.test.titlePath[0]).sort()).toEqual([
      'colors',
      'labels object',
      'null label',
      'number parameter',
      'odd names',
      'odd times',
      'steps string',
    ]);
    const entryOf = (title: string) =>
      must(run.entries.find((e) => e.test.titlePath[0] === title));
    expect(entryOf('number parameter').comparison.diffRatio).toBe(0.5);
    expect(entryOf('number parameter').variant).toBeUndefined();
    expect(entryOf('odd times').duration).toBeUndefined();
    expect(entryOf('odd names')).toMatchObject({
      name: 'odd names',
      message: '',
    });
    expect(entryOf('colors').message).toBe('red');
  });

  it('keeps apart two image diffs whose sources differ in the extension only', async () => {
    const root = await tmpDir();
    writeResults(
      path.join(root, 'allure-results'),
      [
        {
          name: 'two',
          attachments: [
            imageDiff('a.imagediff', 'first'),
            imageDiff('a.json', 'second'),
          ],
        },
      ],
      { 'a.imagediff': full, 'a.json': { ...full, expected: dataUrl(three) } },
    );
    const run = fromAllureResults({ projectRoot: root, ci: null });
    expect(run.entries.map((e) => e.images.baseline.path)).toEqual([
      'allure-results/visual-regression-images/a.imagediff-expected.png',
      'allure-results/visual-regression-images/a.json-expected.png',
    ]);
  });

  it('never writes through a link someone left where an image goes', async () => {
    const root = await tmpDir();
    const outside = await tmpDir();
    const victim = path.join(outside, 'victim.png');
    fs.writeFileSync(victim, 'untouched');
    const images = path.join(root, 'allure-results/visual-regression-images');
    writeResults(
      path.join(root, 'allure-results'),
      [{ name: 'linked', attachments: [imageDiff('a.imagediff')] }],
      { 'a.imagediff': full },
    );
    fs.mkdirSync(images);
    fs.symlinkSync(victim, path.join(images, 'a.imagediff-expected.png'));

    const run = fromAllureResults({ projectRoot: root, ci: null });
    expect(fs.readFileSync(victim, 'utf8')).toBe('untouched');
    const written = path.join(root, run.entries[0].images.baseline.path);
    expect(fs.lstatSync(written).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(written)).toEqual(one);

    // the images folder itself as a link out of the project
    fs.rmSync(images, { recursive: true });
    fs.symlinkSync(outside, images);
    expect(() => fromAllureResults({ projectRoot: root, ci: null })).toThrow(
      /is outside the project root/,
    );
    expect(fs.readdirSync(outside)).toEqual(['victim.png']);
  });

  it('refuses a results folder it cannot read and an images folder outside the project', async () => {
    const root = await tmpDir();
    expect(() => fromAllureResults({ projectRoot: root, ci: null })).toThrow(
      /Cannot read the Allure results folder .*allure-results/,
    );
    fs.mkdirSync(path.join(root, 'allure-results'));
    expect(() =>
      fromAllureResults({ projectRoot: root, ci: null, imagesDir: '../shots' }),
    ).toThrow(/is outside the project root/);
    expect(
      fromAllureResults({ projectRoot: root, ci: null, imagesDir: '.' })
        .entries,
    ).toEqual([]);
  });
});
