import fs from 'node:fs';
import path from 'node:path';
import {
  isSafeRelativePath,
  validateManifest,
  writeManifestFile,
  type Manifest,
  type ManifestStatus,
} from 'visual-regression-manifest';
import { pngSize } from './png.js';
import { sh } from './shell.js';

export type Expectation = {
  /** Status per screenshot name (before `nameOf`). */
  statuses: Record<string, ManifestStatus>;
  /** Screenshot names that must have no entry: the tool left nothing behind for them. */
  absent?: string[];
};
export type Check = { name: string; error?: string };
export type CheckOptions = {
  projectRoot: string;
  nameOf?: (base: string) => string;
  /** Whether the tool's output carries the diff ratio of a failed comparison. */
  reportsDiffRatio?: boolean;
};

const equal = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

/** Every check the real output must pass; nothing throws, failures are returned. */
export const checkManifest = (
  manifest: Manifest,
  { statuses, absent = [] }: Expectation,
  {
    projectRoot,
    nameOf = (base) => base,
    reportsDiffRatio = true,
  }: CheckOptions,
): Check[] => {
  const checks: Check[] = [];
  const check = (name: string, fn: () => void) => {
    try {
      fn();
      checks.push({ name });
    } catch (error) {
      checks.push({
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const issues = validateManifest(manifest);
  check('manifest: validates against the schema', () => {
    if (issues.length) throw new Error(JSON.stringify(issues, null, 2));
  });
  // nothing below means anything for a manifest of the wrong shape
  if (issues.length) return checks;
  check('manifest: projectRoot is the example', () =>
    equal(path.resolve(manifest.projectRoot), path.resolve(projectRoot)),
  );

  const byName = new Map(manifest.entries.map((e) => [e.name, e]));
  const listed = () => [...byName.keys()].join(', ') || 'no entries';
  check('entries: every name is unique', () => {
    const names = manifest.entries.map((e) => e.name);
    const twice = names.filter((name, i) => names.indexOf(name) !== i);
    if (twice.length)
      throw new Error(`found more than once: ${twice.join(', ')}`);
  });
  for (const [base, status] of Object.entries(statuses)) {
    const name = nameOf(base);
    check(`status: ${name} is ${status}`, () => {
      const entry = byName.get(name);
      if (!entry) throw new Error(`no entry named ${name} (got ${listed()})`);
      equal(entry.status, status);
    });
  }
  for (const base of absent) {
    const name = nameOf(base);
    check(`status: ${name} has no entry`, () => {
      const entry = byName.get(name);
      if (entry) throw new Error(`found it as ${entry.status}`);
    });
  }

  for (const entry of manifest.entries) {
    for (const role of ['baseline', 'actual', 'diff'] as const) {
      const image = entry.images[role];
      const imagePath = image.path;
      if (!imagePath) continue;
      const mustBeMissing =
        role === 'baseline' && entry.status === 'missing-baseline';
      check(`image: ${entry.name} ${role} ${imagePath}`, () => {
        if (!isSafeRelativePath(imagePath)) throw new Error('unsafe path');
        const file = path.join(projectRoot, imagePath);
        if (mustBeMissing) {
          if (fs.existsSync(file))
            throw new Error('exists, yet missing-baseline');
          return;
        }
        if (!fs.existsSync(file)) throw new Error('does not exist');
        const size = pngSize(file);
        if (image.width !== undefined) equal(size.width, image.width);
        if (image.height !== undefined) equal(size.height, image.height);
      });
    }
    if (entry.status === 'failed' && reportsDiffRatio) {
      check(`comparison: ${entry.name} has a diffRatio above 0`, () => {
        const ratio = entry.comparison.diffRatio;
        if (!(typeof ratio === 'number' && ratio > 0)) {
          throw new Error(`diffRatio is ${JSON.stringify(ratio)}`);
        }
      });
    }
    if (entry.status === 'passed') {
      check(`images: ${entry.name} passed without actual and diff`, () => {
        equal(entry.images.actual.path, null);
        equal(entry.images.diff.path, null);
      });
    }
  }
  return checks;
};

/** Prints `ok`/`FAIL` lines, the evidence of a run, and returns the number of failures. */
export const printChecks = (checks: Check[]) => {
  let failed = 0;
  for (const { name, error } of checks) {
    if (error === undefined) console.log(`ok   ${name}`);
    else {
      failed++;
      console.log(`FAIL ${name}: ${error}`);
    }
  }
  return failed;
};

const harnessDir = path.resolve(import.meta.dirname, '..');

/**
 * Writes the manifest next to the images (the viewer resolves paths against the
 * manifest's folder) and builds the review page from it with the viewer CLI,
 * the way a consumer would. The page goes under the harness, not the example:
 * it copies the images, and a converter that scans the project would find them.
 * Returns the report folder.
 */
export const viewerReport = (
  manifest: Manifest,
  projectRoot: string,
  label: string,
) => {
  const file = path.join(
    projectRoot,
    `visual-regression-manifest.${label}.json`,
  );
  writeManifestFile(file, manifest);
  const out = path.join(harnessDir, 'test-results', label);
  fs.rmSync(out, { recursive: true, force: true });
  sh(
    'node_modules/.bin/visual-regression-viewer',
    [file, '--no-serve', '-o', out],
    { cwd: harnessDir },
  );
  if (!fs.existsSync(path.join(out, 'index.html'))) {
    throw new Error(`the viewer wrote no index.html into ${out}`);
  }
  return out;
};
