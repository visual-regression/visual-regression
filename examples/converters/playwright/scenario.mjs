// Playwright `toHaveScreenshot`: baselines in tests/box.spec.mjs-snapshots/<arg>-<project>-<platform>.png,
// the JSON report lists the expected/actual/diff copies a failed comparison left in the
// output folder. A passing comparison leaves nothing. The same runs are also converted
// from the CTRF report that playwright-ctrf-json-reporter wrote (`fromCtrf`, lenient) and
// from the Allure results that allure-playwright wrote (`fromAllureResults`).
import fs from 'node:fs';
import path from 'node:path';
import {
  fromAllureResults,
  fromCtrf,
  fromPlaywrightReport,
} from 'visual-regression-manifest';

export const name = 'playwright';
export const projectRoot = import.meta.dirname;
export const nameOf = (base) => `${base}-chromium-${process.platform}`;

const snapshots = path.join(projectRoot, 'tests', 'box.spec.mjs-snapshots');
const results = path.join(projectRoot, 'test-results');

/**
 * `none` (updateSnapshots: 'none', what CI runs): box-c has no baseline and gets none;
 * nothing is attached, only the error names the file. `default` (Playwright's
 * default): box-c's baseline is written and the test fails. `ctrf-*`: the same runs
 * read from the CTRF report instead of Playwright's own. CTRF names a test by its
 * title, carries no diff ratio, and knows images only as attachments: a comparison
 * without a baseline attachment has no entry, a freshly written baseline looks like
 * a failure. `allure-*`: the same runs read from the Allure results. Allure knows a
 * comparison only as an image diff attachment, which holds the images and no ratio:
 * a comparison without one has no entry, and a freshly written baseline is attached
 * as an actual image alone, which reads as a missing baseline. The order matters:
 * `default` writes the box-c baseline that the `none` modes must not see.
 */
export const modes = [
  'none',
  'ctrf-none',
  'allure-none',
  'default',
  'ctrf-default',
  'allure-default',
];
// what a report of another format lacks: the diff ratio and the snapshot's file name
const ctrf = { reportsDiffRatio: false, nameOf: (base) => base };
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  none: {
    statuses: { 'box-b': 'failed', 'box-c': 'missing-baseline' },
    absent: ['box-a'],
  },
  'ctrf-none': {
    ...ctrf,
    statuses: { 'box-b': 'failed' },
    absent: ['box-a', 'box-c'],
  },
  'allure-none': {
    ...ctrf,
    statuses: { 'box-b': 'failed' },
    absent: ['box-a', 'box-c'],
  },
  default: {
    statuses: { 'box-b': 'failed', 'box-c': 'created' },
    absent: ['box-a'],
  },
  'ctrf-default': {
    ...ctrf,
    statuses: { 'box-b': 'failed', 'box-c': 'failed' },
    absent: ['box-a'],
  },
  'allure-default': {
    ...ctrf,
    statuses: { 'box-b': 'failed', 'box-c': 'missing-baseline' },
    absent: ['box-a'],
  },
};

const runOf = (mode) => mode.replace(/^(ctrf|allure)-/, '');
const allureResults = (mode) => path.join(reportsDir(mode), 'allure-results');
const reportsDir = (mode) => path.join(results, `${runOf(mode)}-reports`);

const playwright = (ctx, env) =>
  ctx.sh('node_modules/.bin/playwright', ['test'], {
    cwd: projectRoot,
    env,
    allowFailure: true,
  });

export async function clean() {
  fs.rmSync(snapshots, { recursive: true, force: true });
  fs.rmSync(results, { recursive: true, force: true });
}

export async function record(ctx) {
  const run = await playwright(ctx, {
    PW_UPDATE: 'all',
    PW_OUTPUT: 'test-results/record',
    E2E_VARIANT: 'a',
  });
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  fs.rmSync(path.join(snapshots, `${nameOf('box-c')}.png`));
}

export async function compare(mode, ctx) {
  if (mode !== runOf(mode)) return; // converts the run of the mode before it
  // exits 1: box-b fails by design, and so does box-c in both modes
  await playwright(ctx, {
    PW_UPDATE: mode === 'none' ? 'none' : undefined,
    PW_OUTPUT: `test-results/${mode}`,
    E2E_VARIANT: 'b',
  });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** An Allure result without the name of the machine and the process that wrote it. */
const withoutMachine = (result) => ({
  ...result,
  labels: result.labels.map((label) =>
    label.name === 'host' || label.name === 'thread'
      ? { ...label, value: label.name }
      : label,
  ),
});

export function convert(mode) {
  if (mode.startsWith('allure-')) {
    return fromAllureResults({
      projectRoot,
      resultsDir: allureResults(mode),
      maxDiffPixels: 0,
    });
  }
  if (mode.startsWith('ctrf-')) {
    return fromCtrf(readJson(path.join(reportsDir(mode), 'ctrf-report.json')), {
      projectRoot,
      lenient: true,
    });
  }
  return fromPlaywrightReport(
    readJson(path.join(reportsDir(mode), 'report.json')),
    { projectRoot, maxDiffPixels: 0 },
  );
}

/** The reports name the example folder in absolute paths; the fixture stands in for it. */
export async function capture(outDir, mode) {
  const run = runOf(mode);
  if (mode.startsWith('allure-')) {
    // the results and the image diffs they name; the other attachments are not read
    const out = path.join(
      outDir,
      path.relative(projectRoot, allureResults(mode)),
    );
    fs.mkdirSync(out, { recursive: true });
    for (const file of fs.readdirSync(allureResults(mode))) {
      if (!/-result\.json$|\.imagediff$/.test(file)) continue;
      const text = fs.readFileSync(
        path.join(allureResults(mode), file),
        'utf8',
      );
      fs.writeFileSync(
        path.join(out, file),
        file.endsWith('-result.json')
          ? `${JSON.stringify(withoutMachine(JSON.parse(text)), null, 2)}\n`
          : text,
      );
    }
    return;
  }
  fs.cpSync(snapshots, path.join(outDir, 'tests', 'box.spec.mjs-snapshots'), {
    recursive: true,
  });
  fs.cpSync(path.join(results, run), path.join(outDir, 'test-results', run), {
    recursive: true,
  });
  const report = mode.startsWith('ctrf-') ? 'ctrf-report.json' : 'report.json';
  const text = fs.readFileSync(path.join(reportsDir(mode), report), 'utf8');
  fs.mkdirSync(path.join(outDir, 'test-results', `${run}-reports`), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(outDir, 'test-results', `${run}-reports`, report),
    text.replaceAll(projectRoot, '__PROJECT_ROOT__'),
  );
  // the snapshot suffix the baselines were recorded with
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    `${JSON.stringify({ platform: process.platform }, null, 2)}\n`,
  );
}
