#!/usr/bin/env node
// Consumer-side smoke test of the BUILT manifest package: resolves it the way the
// viewer does (workspace link + package `exports`), loads the cjs and esm builds and
// runs write -> read -> merge -> CTRF round trip -> convert on a sample run.
//   node smoke-dist.mjs <run-dir>     (<run-dir> from make-sample-run.mjs)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const runDir = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: smoke-dist.mjs <run-dir>');
  process.exit(2);
}
const fromViewer = createRequire(
  path.join(repo, 'packages/visual-regression-viewer/package.json'),
);
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

const cjs = fromViewer('visual-regression-manifest');
const esm = await import(
  fromViewer
    .resolve('visual-regression-manifest')
    .replace(/index\.js$/, 'index.mjs')
);
const schemaPath = fromViewer.resolve('visual-regression-manifest/schema.json');

check('exports: cjs and esm expose the same API', () => {
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  assert.ok(Object.keys(esm).length > 30);
});
check('exports: schema.json resolves and is the shipped schema', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$id, 'https://visual-regression.dev/schema/v1.json');
  assert.deepEqual(schema, esm.manifestSchema);
});

const found = esm.readManifestFiles(runDir);
check('reader: finds and validates the sample manifest', () => {
  assert.equal(found.length, 1);
  assert.deepEqual(esm.validateManifest(found[0].manifest), []);
  assert.equal(found[0].manifest.summary.needsHuman, 2);
});
check('reader: rejects a broken manifest with issues', () => {
  assert.throws(
    () => esm.parseManifest({ reportFormat: 'nope' }, 'x'),
    (e) => e instanceof esm.ManifestParseError && e.issues.length > 0,
  );
});
check('merge: a later attempt wins, counts and needsHuman agree', () => {
  const m = found[0].manifest;
  const later = structuredClone(m);
  later.ci = { ...later.ci, runAttempt: '2' };
  later.entries.find((e) => e.status === 'failed').status = 'passed';
  const run = esm.mergeManifests([{ manifest: m }, { manifest: later }]);
  assert.ok(run.counts.passed >= 1);
  assert.ok(
    run.needsHuman.every((n) =>
      ['failed', 'missing-baseline'].includes(n.entry.status),
    ),
  );
});
check('ctrf: toCtrf -> fromCtrf is lossless on entries', () => {
  const back = esm.fromCtrf(
    JSON.parse(JSON.stringify(esm.toCtrf(found[0].manifest))),
  );
  assert.deepEqual(
    back.entries.map((e) => [e.name, e.status]),
    found[0].manifest.entries.map((e) => [e.name, e.status]),
  );
});
check('convert: image triples produce a valid manifest', () => {
  const m = esm.fromImageTriples({
    projectRoot: runDir,
    runner: { name: 'sample' },
    triples: [
      {
        baseline: 'e2e/__image_snapshots__/home_#0.png',
        actual: 'e2e/__image_snapshots__/home_#0.actual.png',
        diff: 'e2e/__image_snapshots__/home_#0.diff.png',
      },
    ],
  });
  assert.deepEqual(esm.validateManifest(m), []);
  assert.equal(m.entries[0].status, 'failed');
});
