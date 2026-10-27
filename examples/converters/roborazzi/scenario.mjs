// Roborazzi: recordRoborazziDebug writes lib/build/outputs/roborazzi/<name>.png, compareRoborazziDebug
// writes <name>_actual.png and <name>_compare.png next to a changed one; both tasks write
// lib/build/test-results/roborazzi/debug/results-summary.json with absolute paths.
// Needs a JDK, Gradle (GRADLE_BIN, default `gradle`) and the Android SDK: CI has them.
import fs from 'node:fs';
import path from 'node:path';
import { fromRoborazziResults } from 'visual-regression-manifest';

export const name = 'roborazzi';
export const projectRoot = import.meta.dirname;
export const nameOf = (base) => base;

const lib = path.join(projectRoot, 'lib');
const outputs = path.join(lib, 'build', 'outputs', 'roborazzi');
const summary = path.join(
  lib,
  'build',
  'test-results',
  'roborazzi',
  'debug',
  'results-summary.json',
);

/**
 * `compare`: unchanged, changed and added images. `record` afterwards: a second record
 * run overwrites every image, and Roborazzi reports all of them as recorded.
 */
export const modes = ['compare', 'record'];
export const expectations = {
  compare: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  record: {
    statuses: { 'box-a': 'updated', 'box-b': 'updated', 'box-c': 'updated' },
  },
};

const gradle = (ctx, task, variant) =>
  ctx.sh(
    process.env.GRADLE_BIN ?? 'gradle',
    [task, `-Pvariant=${variant}`, '--console=plain'],
    { cwd: projectRoot, allowFailure: true },
  );

export async function clean() {
  fs.rmSync(path.join(lib, 'build'), { recursive: true, force: true });
}

export async function record(ctx) {
  const run = await gradle(ctx, 'recordRoborazziDebug', 'a');
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  fs.rmSync(path.join(outputs, 'box-c.png'));
}

export async function compare(mode, ctx) {
  // the compare task fails on a change; the summary is what matters
  await gradle(
    ctx,
    mode === 'compare' ? 'compareRoborazziDebug' : 'recordRoborazziDebug',
    'b',
  );
}

export function convert() {
  return fromRoborazziResults(JSON.parse(fs.readFileSync(summary, 'utf8')), {
    projectRoot,
    maxDiffRatio: 0, // changeThreshold
  });
}

/** The summary names the module folder in absolute paths; the fixture stands in for it. */
export async function capture(outDir) {
  fs.cpSync(outputs, path.join(outDir, 'lib', 'build', 'outputs', 'roborazzi'), {
    recursive: true,
  });
  const target = path.join(outDir, path.relative(projectRoot, summary));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    fs.readFileSync(summary, 'utf8').replaceAll(projectRoot, '__PROJECT_ROOT__'),
  );
}
