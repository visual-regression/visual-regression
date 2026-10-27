// Three Cypress visual testing plugins in one project, one config file each:
// - cypress-visual-regression: cypress/snapshots/{base,actual,diff}/<spec>/<name>.png
// - @simonsmith/cypress-image-snapshot: <screenshotsFolder>/../snapshots/<spec>/<name>.snap.png,
//   failures in __diff_output__/<name>.diff.png next to them
// - pixsame: <spec dir>/__image_snapshots__/<title>_#0.png with .actual and .diff siblings
import fs from 'node:fs';
import path from 'node:path';
import {
  fromCypressVisualRegression,
  fromImageTriples,
  fromJestImageSnapshots,
} from 'visual-regression-manifest';

export const name = 'cypress';
export const projectRoot = import.meta.dirname;
/** The plugins compare on their own; the files carry no ratio. */
export const reportsDiffRatio = false;

const cvrDir = path.join(projectRoot, 'cypress', 'snapshots');
const imageSnapshotDir = path.join(projectRoot, 'cypress', 'image-snapshot');
const pixsameDir = path.join(
  projectRoot,
  'cypress',
  'e2e',
  'pixsame',
  '__image_snapshots__',
);

/**
 * `cvr`: a regression run; a missing base leaves the actual and fails.
 * `image-snapshot` with requireSnapshots: a missing snapshot fails and writes nothing;
 * `image-snapshot-write` without it: the snapshot is written and the test passes.
 * `pixsame` with createMissingImages off: a missing baseline fails; `pixsame-create`
 * (the default): it is written and the test passes.
 */
export const modes = [
  'cvr',
  'image-snapshot',
  'image-snapshot-write',
  'pixsame',
  'pixsame-create',
];
const pixsameName = (base) => `${base}_#0`;
export const expectations = {
  cvr: {
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  'image-snapshot': {
    statuses: { 'box-a': 'passed', 'box-b': 'failed' },
    absent: ['box-c'],
  },
  'image-snapshot-write': {
    statuses: { 'box-a': 'passed', 'box-b': 'failed', 'box-c': 'passed' },
  },
  pixsame: {
    nameOf: pixsameName,
    statuses: {
      'box-a': 'passed',
      'box-b': 'failed',
      'box-c': 'missing-baseline',
    },
  },
  'pixsame-create': {
    nameOf: pixsameName,
    statuses: { 'box-a': 'passed', 'box-b': 'failed', 'box-c': 'passed' },
  },
};

const configOf = (mode) => mode.replace(/-(write|create)$/, '');

const cypress = (ctx, mode, env) =>
  ctx.sh(
    'node_modules/.bin/cypress',
    [
      'run',
      '--config-file',
      `cypress.${configOf(mode)}.config.mjs`,
      '--browser',
      'electron',
      '--headless',
    ],
    { cwd: projectRoot, env, allowFailure: true },
  );

/** Every file of that name below `dir`. */
const findFiles = (dir, fileName) => {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === fileName) found.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
};

export async function clean() {
  for (const dir of [cvrDir, imageSnapshotDir, pixsameDir]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(projectRoot, 'cypress', 'screenshots'), {
    recursive: true,
    force: true,
  });
}

export async function record(ctx) {
  const runs = {
    cvr: { CVR_TYPE: 'base' },
    'image-snapshot': { CIS_UPDATE: '1' },
    pixsame: { PIXSAME_UPDATE: '1' },
  };
  for (const [mode, env] of Object.entries(runs)) {
    const run = await cypress(ctx, mode, { ...env, E2E_VARIANT: 'a' });
    if (run.status !== 0) {
      throw new Error(`recording ${mode} failed:\n${run.output}`);
    }
  }
}

export async function perturb() {
  const baselines = [
    ...findFiles(path.join(cvrDir, 'base'), 'box-c.png'),
    ...findFiles(imageSnapshotDir, 'box-c.snap.png'),
    ...findFiles(pixsameDir, 'box-c_#0.png'),
  ];
  if (baselines.length !== 3) {
    throw new Error(
      `expected 3 box-c baselines, found ${baselines.join(', ')}`,
    );
  }
  for (const file of baselines) fs.rmSync(file);
}

export async function compare(mode, ctx) {
  const env = {
    cvr: { CVR_TYPE: 'regression' },
    'image-snapshot': { CIS_REQUIRE: '1' },
    'image-snapshot-write': {},
    pixsame: { PIXSAME_CREATE: '0' },
    'pixsame-create': {},
  }[mode];
  // exits 1: box-b fails by design, box-c too in most modes
  await cypress(ctx, mode, { ...env, E2E_VARIANT: 'b' });
}

export function convert(mode) {
  const runner = { name: 'cypress' };
  if (mode === 'cvr') {
    return fromCypressVisualRegression({ projectRoot, maxDiffRatio: 0 });
  }
  if (mode.startsWith('image-snapshot')) {
    return fromJestImageSnapshots({
      projectRoot,
      runner,
      snapshotsDir: 'cypress/image-snapshot/snapshots',
      snapshotPostfix: '.snap',
      diffPostfix: '.diff',
      receivedPostfix: '.received',
      maxDiffPixels: 0,
    });
  }
  // pixsame: every image that is not an .actual or .diff sibling is a baseline;
  // an .actual without its baseline is a comparison that had none
  const images = fs.existsSync(pixsameDir) ? fs.readdirSync(pixsameDir) : [];
  const stems = new Set(
    images
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.replace(/(\.actual|\.diff)?\.png$/, '')),
  );
  return fromImageTriples({
    projectRoot,
    runner,
    triples: [...stems].map((stem) => ({
      baseline: path.join(pixsameDir, `${stem}.png`),
      testFile: 'cypress/e2e/pixsame/box.cy.js',
      maxDiffRatio: 0,
    })),
  });
}

export async function capture(outDir, mode) {
  const from =
    mode === 'cvr'
      ? cvrDir
      : mode.startsWith('image-snapshot')
        ? imageSnapshotDir
        : pixsameDir;
  fs.cpSync(from, path.join(outDir, path.relative(projectRoot, from)), {
    recursive: true,
  });
}
