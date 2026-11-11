// reg-cli compares a folder of actual images with a folder of expected ones:
// `reg-cli actual expected diff -J reg.json` writes diff/<name>.png for every changed
// image and reg.json with the failed, new, deleted and passed items; `-U` then copies
// the failed and new actuals over the expected images. The screenshots come from
// shoot.mjs (the Playwright library), as reg-cli takes images from any source.
import fs from 'node:fs';
import path from 'node:path';
import { fromRegCli } from 'visual-regression-manifest';

export const name = 'reg-cli';
export const projectRoot = import.meta.dirname;
/** reg.json lists file names, no ratios. */
export const reportsDiffRatio = false;

const actual = path.join(projectRoot, 'actual');
const expected = path.join(projectRoot, 'expected');
const diff = path.join(projectRoot, 'diff');
const report = path.join(projectRoot, 'reg.json');

/**
 * `compare`: a plain run; box-b is a failed item, box-c a new one. `update`: the
 * same comparison with `-U`, after which the expected images of both are written,
 * so they are `updated` and `created`. Both runs also see box-d, an expected image
 * with no actual (a deleted item): the manifest has no status for a baseline
 * nobody compared against, so it gets no entry. `update` goes last: it rewrites
 * the expected images.
 */
export const modes = ['compare', 'update'];
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  compare: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
    absent: ['box-d'],
  },
  update: {
    statuses: { 'box-a': 'passed', 'box-b': 'updated', 'box-c': 'created' },
    absent: ['box-d'],
  },
};

const shoot = async (ctx, variant) => {
  const run = await ctx.sh('node', ['shoot.mjs'], {
    cwd: projectRoot,
    env: { E2E_VARIANT: variant },
  });
  return run;
};

const regCli = (ctx, update) =>
  ctx.sh(
    'node_modules/.bin/reg-cli',
    ['actual', 'expected', 'diff', '-J', 'reg.json', ...(update ? ['-U'] : [])],
    { cwd: projectRoot, allowFailure: true },
  );

export async function clean() {
  for (const dir of [actual, expected, diff]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(report, { force: true });
}

export async function record(ctx) {
  await shoot(ctx, 'a');
  // every actual is a new item; -U copies them into expected/
  const run = await regCli(ctx, true);
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  fs.rmSync(path.join(expected, 'box-c.png'));
  // an expected image of a screenshot nobody takes any more: a deleted item
  fs.copyFileSync(
    path.join(expected, 'box-a.png'),
    path.join(expected, 'box-d.png'),
  );
}

export async function compare(mode, ctx) {
  await shoot(ctx, 'b');
  // exits 1 without -U: box-b changed
  await regCli(ctx, mode === 'update');
}

export function convert(mode) {
  return fromRegCli(JSON.parse(fs.readFileSync(report, 'utf8')), {
    projectRoot,
    update: mode === 'update',
    maxDiffPixels: 0, // no --thresholdRate or --thresholdPixel: any differing pixel fails
  });
}

export async function capture(outDir) {
  for (const dir of [actual, expected, diff]) {
    fs.cpSync(dir, path.join(outDir, path.basename(dir)), { recursive: true });
  }
  fs.copyFileSync(report, path.join(outDir, 'reg.json'));
}
