// jest-image-snapshot: baselines in tests/__image_snapshots__/<id>.png, where <id> is the
// customSnapshotIdentifier (box.test.js) or `<file>-<title>-<n>-snap` (default-names.test.js).
// A failed comparison leaves __diff_output__/<id>-diff.png (baseline | diff | received
// composite) and, with storeReceivedOnFailure, __received_output__/<id>-received.png.
import fs from 'node:fs';
import path from 'node:path';
import { fromJestImageSnapshots } from 'visual-regression-manifest';

export const name = 'jest-image-snapshot';
export const projectRoot = import.meta.dirname;
export const nameOf = (base) => base;

const snapshots = path.join(projectRoot, 'tests', '__image_snapshots__');

/**
 * `ci`: `jest --ci` never writes a missing baseline, so box-c fails without a trace.
 * `local`: without `--ci` the missing baseline is written and the test passes; on disk
 * that is the same as a baseline that always existed, so the converter reports `passed`.
 */
export const modes = ['ci', 'local'];
const defaultNamed =
  'default-names-test-js-box-a-with-the-default-identifier-1';
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  ci: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      [defaultNamed]: 'passed',
    },
    absent: ['box-c'],
  },
  local: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'passed',
      [defaultNamed]: 'passed',
    },
  },
};
/** The matcher's pixel count is printed, not stored; the files carry no ratio. */
export const reportsDiffRatio = false;

const jest = (ctx, args, variant) =>
  ctx.sh('node_modules/.bin/jest', args, {
    cwd: projectRoot,
    env: { E2E_VARIANT: variant },
    allowFailure: true,
  });

export async function clean() {
  fs.rmSync(snapshots, { recursive: true, force: true });
}

export async function record(ctx) {
  const run = await jest(ctx, ['-u'], 'a');
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  fs.rmSync(path.join(snapshots, 'box-c.png'));
}

export async function compare(mode, ctx) {
  // exits 1: box-b fails by design
  await jest(ctx, [mode === 'ci' ? '--ci' : '--ci=false'], 'b');
}

export function convert() {
  return fromJestImageSnapshots({
    projectRoot,
    maxDiffPixels: 0, // failureThreshold 0 with failureThresholdType 'pixel'
  });
}

export async function capture(outDir) {
  fs.cpSync(snapshots, path.join(outDir, 'tests', '__image_snapshots__'), {
    recursive: true,
  });
}
