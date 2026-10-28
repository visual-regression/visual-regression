// Vitest browser mode `toMatchScreenshot`: references in tests/__screenshots__/box.test.ts/
// <name>-<browser>-<platform>.png; a failed comparison writes the actual and diff images
// under .vitest/attachments/. What a missing reference leaves behind depends on CI.
import fs from 'node:fs';
import path from 'node:path';
import { fromVitestScreenshots } from 'visual-regression-manifest';

export const name = 'vitest-browser';
export const projectRoot = import.meta.dirname;
export const nameOf = (base) => `${base}-chromium-${process.platform}`;
/** pixelmatch's count is printed, not stored; the files carry no ratio. */
export const reportsDiffRatio = false;

const screenshots = path.join(projectRoot, 'tests', '__screenshots__');
const attachments = path.join(projectRoot, '.vitest');

/**
 * `ci` (CI detected): a missing reference is not written; the actual is stored as an
 * attachment and the test fails. `local`: the reference is written, so on disk box-c
 * looks like a passed comparison. `ci` runs first: `local` writes the reference.
 */
export const modes = ['ci', 'local'];
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  ci: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  local: {
    statuses: { 'box-a': 'passed', 'box-b': 'failed', 'box-c': 'passed' },
  },
};

// Vitest asks std-env whether this is CI: the generic CI variable and the
// provider ones (GitHub Actions sets GITHUB_ACTIONS) all count
const notCi = {
  CI: undefined,
  CONTINUOUS_INTEGRATION: undefined,
  BUILD_NUMBER: undefined,
  RUN_ID: undefined,
  GITHUB_ACTIONS: undefined,
};

const vitest = (ctx, args, env) =>
  ctx.sh('node_modules/.bin/vitest', ['run', ...args], {
    cwd: projectRoot,
    env,
    allowFailure: true,
  });

export async function clean() {
  fs.rmSync(screenshots, { recursive: true, force: true });
  fs.rmSync(attachments, { recursive: true, force: true });
}

export async function record(ctx) {
  const run = await vitest(ctx, ['--update'], { ...notCi, E2E_VARIANT: 'a' });
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  fs.rmSync(path.join(screenshots, 'box.test.ts', `${nameOf('box-c')}.png`));
}

export async function compare(mode, ctx) {
  // exits 1: box-b fails by design, box-c too
  await vitest(ctx, [], {
    ...(mode === 'ci' ? { CI: 'true' } : notCi),
    E2E_VARIANT: 'b',
  });
}

export function convert() {
  return fromVitestScreenshots({
    projectRoot,
    maxDiffRatio: 0, // allowedMismatchedPixelRatio
  });
}

export async function capture(outDir) {
  fs.cpSync(screenshots, path.join(outDir, 'tests', '__screenshots__'), {
    recursive: true,
  });
  fs.cpSync(attachments, path.join(outDir, '.vitest'), { recursive: true });
}
