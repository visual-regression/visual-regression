// BackstopJS: `backstop reference` writes backstop_data/bitmaps_reference/<id>_<label>_<n>_<selector>_<n>_<viewport>.png,
// `backstop test` writes the test bitmaps and diffs under bitmaps_test/<timestamp>/ and,
// with `report: ['json']`, json_report/jsonReport.json with paths relative to that folder.
import fs from 'node:fs';
import path from 'node:path';
import { fromBackstopReport } from 'visual-regression-manifest';

export const name = 'backstopjs';
export const projectRoot = import.meta.dirname;
/** Entries are named after the bitmap file: `<id>_<label>_<selector index>_<selector>_<viewport index>_<viewport>`. */
export const nameOf = (base) => `e2e_${base}_0_${base}_0_phone`;

const data = path.join(projectRoot, 'backstop_data');
const references = path.join(data, 'bitmaps_reference');
const harness = path.resolve(projectRoot, '..', 'harness');

/** One compare run: the mismatch percentage is in the report, a missing reference is an error. */
export const modes = ['test'];
/** @type {import('../harness/src/scenario.js').Scenario['expectations']} */
export const expectations = {
  test: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
};

let server;

const backstop = (ctx, command, env) =>
  ctx.sh(
    'node_modules/.bin/backstop',
    [command, '--config=backstop.config.cjs'],
    {
      cwd: projectRoot,
      env: { ...env, E2E_BASE_URL: server.url },
      allowFailure: true,
    },
  );

export async function clean() {
  fs.rmSync(data, { recursive: true, force: true });
}

export async function record(ctx) {
  server ??= await ctx.serveStatic(harness);
  const run = await backstop(ctx, 'reference', { E2E_VARIANT: 'a' });
  if (run.status !== 0) throw new Error(`recording failed:\n${run.output}`);
}

export async function perturb() {
  const reference = fs
    .readdirSync(references)
    .filter((file) => file.includes('box-c'));
  if (reference.length !== 1) {
    throw new Error(
      `expected one box-c reference, found ${reference.join(', ')}`,
    );
  }
  fs.rmSync(path.join(references, reference[0]));
}

export async function compare(mode, ctx) {
  // exits 1: box-b differs and box-c has no reference
  await backstop(ctx, 'test', { E2E_VARIANT: 'b' });
}

export function convert() {
  return fromBackstopReport(
    JSON.parse(
      fs.readFileSync(
        path.join(data, 'json_report', 'jsonReport.json'),
        'utf8',
      ),
    ),
    { projectRoot },
  );
}

export async function teardown() {
  await server?.close();
  server = undefined;
}

export async function capture(outDir) {
  for (const dir of ['bitmaps_reference', 'bitmaps_test', 'json_report']) {
    fs.cpSync(path.join(data, dir), path.join(outDir, 'backstop_data', dir), {
      recursive: true,
    });
  }
}
