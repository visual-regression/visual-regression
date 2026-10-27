// Playwright `toHaveScreenshot`: baselines in tests/box.spec.mjs-snapshots/<arg>-<project>-<platform>.png,
// the JSON report lists the expected/actual/diff copies a failed comparison left in the
// output folder. A passing comparison leaves nothing. The same runs are also converted
// from the CTRF report that playwright-ctrf-json-reporter wrote (`fromCtrf`, lenient).
import fs from 'node:fs';
import path from 'node:path';
import { fromCtrf, fromPlaywrightReport } from 'visual-regression-manifest';

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
 * a failure. The order matters: `default` writes the box-c baseline that `none` and
 * `ctrf-none` must not see.
 */
export const modes = ['none', 'ctrf-none', 'default', 'ctrf-default'];
const ctrf = { reportsDiffRatio: false, nameOf: (base) => base };
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
  default: {
    statuses: { 'box-b': 'failed', 'box-c': 'created' },
    absent: ['box-a'],
  },
  'ctrf-default': {
    ...ctrf,
    statuses: { 'box-b': 'failed', 'box-c': 'failed' },
    absent: ['box-a'],
  },
};

const runOf = (mode) => mode.replace(/^ctrf-/, '');
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
  const run = playwright(ctx, {
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
  if (mode.startsWith('ctrf-')) return; // converts the run of the mode before it
  // exits 1: box-b fails by design, and so does box-c in both modes
  playwright(ctx, {
    PW_UPDATE: mode === 'none' ? 'none' : undefined,
    PW_OUTPUT: `test-results/${mode}`,
    E2E_VARIANT: 'b',
  });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export function convert(mode) {
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
