// Lost Pixel (generateOnly mode): every run empties .lostpixel/current and
// .lostpixel/difference, shoots every page into current/, compares with baseline/ and
// writes difference/<name>.png for a shot over its threshold; with
// LOST_PIXEL_GENERATE_META=true also current/meta.json with every comparison's
// pixel difference. `lost-pixel update` then copies changed and new shots over the
// baselines.
import fs from 'node:fs';
import path from 'node:path';
import { fromLostPixel } from 'visual-regression-manifest';

export const name = 'lost-pixel';
export const projectRoot = import.meta.dirname;
/** The ratio comes from meta.json; `compare-no-meta` runs without it. */
export const reportsDiffRatio = true;

const shots = path.join(projectRoot, '.lostpixel');
const baselines = path.join(shots, 'baseline');
const harness = path.resolve(projectRoot, '..', 'harness');

/**
 * `compare`: a run with meta.json; box-b is over the threshold, box-c has no baseline.
 * `compare-no-meta`: the same run without meta.json, read from the files alone.
 * `update`: `lost-pixel update` with meta.json; box-b's baseline is overwritten and
 * box-c's written. It goes last: it rewrites the baselines.
 */
export const modes = ['compare', 'compare-no-meta', 'update'];
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  compare: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  'compare-no-meta': {
    reportsDiffRatio: false,
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  update: {
    statuses: { 'box-a': 'passed', 'box-b': 'updated', 'box-c': 'created' },
  },
};

let server;

const lostPixel = (ctx, args, env) =>
  ctx.sh('node_modules/.bin/lost-pixel', args, {
    cwd: projectRoot,
    env: {
      ...env,
      E2E_BASE_URL: server.url,
      LOST_PIXEL_DISABLE_TELEMETRY: '1',
    },
    // exits 1 whenever a shot differs or has no baseline, `update` included
    allowFailure: true,
  });

export async function clean() {
  fs.rmSync(shots, { recursive: true, force: true });
}

export async function record(ctx) {
  server ??= await ctx.serveStatic(harness);
  const run = await lostPixel(ctx, ['update'], {
    E2E_VARIANT: 'a',
    LOST_PIXEL_GENERATE_META: 'true',
  });
  const missing = ['a', 'b', 'c'].filter(
    (box) => !fs.existsSync(path.join(baselines, `box-${box}.png`)),
  );
  if (missing.length > 0) {
    throw new Error(
      `recording wrote no baseline for ${missing.join(', ')}:\n${run.output}`,
    );
  }
}

export async function perturb() {
  fs.rmSync(path.join(baselines, 'box-c.png'));
}

export async function compare(mode, ctx) {
  await lostPixel(ctx, mode === 'update' ? ['update'] : [], {
    E2E_VARIANT: 'b',
    LOST_PIXEL_GENERATE_META: mode === 'compare-no-meta' ? undefined : 'true',
  });
}

export function convert(mode) {
  return fromLostPixel({
    projectRoot,
    update: mode === 'update',
    threshold: 0, // the config's threshold
  });
}

export async function teardown() {
  await server?.close();
  server = undefined;
}

export async function capture(outDir) {
  // lost-pixel drops a .gitignore into .lostpixel that would hide the fixture's current/ and difference/
  fs.cpSync(shots, path.join(outDir, '.lostpixel'), {
    recursive: true,
    filter: (source) => path.basename(source) !== '.gitignore',
  });
}
