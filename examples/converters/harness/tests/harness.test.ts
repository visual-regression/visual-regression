// The harness's own negative controls: a check that cannot fail proves nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fromImageTriples } from 'visual-regression-manifest';
import { checkManifest } from '../src/assert-manifest.js';
import { encodePng, pngSize } from '../src/png.js';

// every temp folder a test made, removed after it
const tmpDirs: string[] = [];
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-harness-'));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const project = () => {
  const root = tmpDir();
  const write = (rel: string, width: number, height: number, fill: number) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(width, height, fill));
  };
  write('shots/box-a.png', 8, 6, 1);
  write('shots/box-b.png', 8, 6, 1);
  write('shots/box-b.actual.png', 8, 6, 2);
  write('shots/box-b.diff.png', 8, 6, 3);
  write('shots/box-c.actual.png', 8, 6, 2);
  const manifest = fromImageTriples({
    projectRoot: root,
    ci: null,
    runner: { name: 'harness' },
    triples: ['box-a', 'box-b', 'box-c'].map((name) => ({
      baseline: `shots/${name}.png`,
      diffRatio: name === 'box-b' ? 0.5 : undefined,
    })),
  });
  return { root, manifest };
};
const failures = (checks: ReturnType<typeof checkManifest>) =>
  checks.filter((c) => c.error).map((c) => `${c.name}: ${c.error}`);

describe('checkManifest', () => {
  it('passes a manifest that matches the files and the expectations', () => {
    const { root, manifest } = project();
    const checks = checkManifest(
      manifest,
      {
        statuses: {
          'box-a': 'passed',
          'box-b': 'failed',
          'box-c': 'missing-baseline',
        },
        absent: ['box-d'],
      },
      { projectRoot: root },
    );
    expect(failures(checks)).toEqual([]);
    expect(checks.length).toBeGreaterThan(8);
  });

  it('fails on a wrong status, an unexpected entry and a missing diff ratio', () => {
    const { root, manifest } = project();
    const checks = checkManifest(
      manifest,
      { statuses: { 'box-a': 'failed' }, absent: ['box-c'] },
      { projectRoot: root },
    );
    expect(failures(checks)).toEqual([
      'status: box-a is failed: expected "failed", got "passed"',
      'status: box-c has no entry: found it as missing-baseline',
    ]);
    manifest.entries[1].comparison.diffRatio = 0;
    expect(
      failures(
        checkManifest(manifest, { statuses: {} }, { projectRoot: root }),
      ),
    ).toEqual(['comparison: box-b has a diffRatio above 0: diffRatio is 0']);
  });

  it('fails on an image that is not on disk, has another size, or exists although the baseline is missing', () => {
    const { root, manifest } = project();
    fs.rmSync(path.join(root, 'shots/box-b.diff.png'));
    fs.writeFileSync(path.join(root, 'shots/box-a.png'), encodePng(9, 6, 1));
    fs.writeFileSync(path.join(root, 'shots/box-c.png'), encodePng(8, 6, 1));
    expect(
      failures(
        checkManifest(manifest, { statuses: {} }, { projectRoot: root }),
      ),
    ).toEqual([
      'image: box-a baseline shots/box-a.png: expected 8, got 9',
      'image: box-b diff shots/box-b.diff.png: does not exist',
      'image: box-c baseline shots/box-c.png: exists, yet missing-baseline',
    ]);
  });

  it('fails on two entries with the same name', () => {
    const { root, manifest } = project();
    manifest.entries.push({ ...manifest.entries[0] });
    expect(
      failures(
        checkManifest(manifest, { statuses: {} }, { projectRoot: root }),
      ),
    ).toEqual(['entries: every name is unique: found more than once: box-a']);
  });

  it('rejects a manifest that does not validate', () => {
    const { root, manifest } = project();
    const broken = { ...manifest, entries: [{ nope: true }] } as never;
    const checks = checkManifest(
      broken,
      { statuses: {} },
      { projectRoot: root },
    );
    expect(failures(checks)[0]).toMatch(
      /^manifest: validates against the schema/,
    );
  });
});

describe('pngSize', () => {
  it('reads the IHDR size and rejects other files', () => {
    const file = path.join(tmpDir(), 'size.png');
    fs.writeFileSync(file, encodePng(80, 120));
    expect(pngSize(file)).toEqual({ width: 80, height: 120 });
    fs.writeFileSync(file, 'not a png');
    expect(() => pngSize(file)).toThrow(/not a PNG/);
  });
});
