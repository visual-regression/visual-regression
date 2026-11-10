import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isManifest, readManifestFile } from 'visual-regression-manifest';
import { approve } from './approve';
import { createComparer } from './comparer';
import { fsStore } from './store';
import { makePng } from './test-utils';

let dir: tmp.DirectoryResult;
beforeEach(async () => {
  dir = await tmp.dir({ unsafeCleanup: true });
});
afterEach(() => dir.cleanup());

const file = (...parts: string[]) => path.join(dir.path, ...parts);
const put = (name: string, bytes: Uint8Array) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), bytes);
};
const exists = (name: string) => fs.existsSync(file(name));

/** A run with one failure (`a`), one new screenshot (`n`) and one pass (`ok`). */
const run = async (manifestName = 'run.json', variant?: string) => {
  put('base/a.png', makePng(8, 8));
  put('base/ok.png', makePng(8, 8));
  const comparer = createComparer({
    store: fsStore({ baselineDir: file('base') }),
    manifest: { projectRoot: dir.path, path: file(manifestName), variant },
    concurrency: 1,
  });
  await comparer.compareImage({
    name: 'a',
    actual: makePng(8, 8, [1, 2, 3, 255]),
  });
  await comparer.compareImage({ name: 'n', actual: makePng(8, 8) });
  await comparer.compareImage({ name: 'ok', actual: makePng(8, 8) });
  await comparer.close();
  return file(manifestName);
};

describe('approve', () => {
  it('moves the actual over the baseline and rewrites the manifest', async () => {
    const manifest = await run();
    const changed = fs.readFileSync(file('base/a.actual.png'));
    const result = approve({ manifests: [manifest], repoRoot: dir.path });
    expect(result.skipped).toEqual([]);
    expect(result.files).toEqual(['base/a.png', 'base/n.png']);
    expect(fs.readFileSync(file('base/a.png'))).toEqual(changed);
    expect(exists('base/a.actual.png')).toBe(false);
    expect(exists('base/a.diff.png')).toBe(false);

    const written = readManifestFile(manifest);
    expect(isManifest(written)).toBe(true);
    expect(written.summary).toMatchObject({
      approved: 2,
      needsHuman: 0,
      passed: 1,
    });
    expect(written.entries.find((e) => e.name === 'a')).toMatchObject({
      status: 'approved',
      baselineWritten: true,
      images: { actual: { path: null }, diff: { path: null } },
    });
  });

  it('approves by name and by test file, and reports unknown names', async () => {
    const manifest = await run();
    const result = approve({
      manifests: [manifest],
      repoRoot: dir.path,
      names: ['n', 'nothing'],
    });
    expect(result.files).toEqual(['base/n.png']);
    expect(result.unknown).toEqual(['nothing']);
    expect(exists('base/a.actual.png')).toBe(true);
    expect(
      approve({
        manifests: [manifest],
        repoRoot: dir.path,
        testFile: 'x.spec.ts',
      }).approved,
    ).toEqual([]);
  });

  it('changes nothing on a dry run', async () => {
    const manifest = await run();
    const before = fs.readFileSync(manifest, 'utf8');
    const result = approve({
      manifests: [manifest],
      repoRoot: dir.path,
      dryRun: true,
    });
    expect(result.approved).toHaveLength(2);
    expect(fs.readFileSync(manifest, 'utf8')).toBe(before);
    expect(exists('base/a.actual.png')).toBe(true);
  });

  it('skips an entry whose baseline changed since the run, unless forced', async () => {
    const manifest = await run();
    put('base/a.png', makePng(8, 8, [9, 9, 9, 255]));
    const skipped = approve({ manifests: [manifest], repoRoot: dir.path });
    expect(skipped.skipped).toEqual([
      expect.objectContaining({
        reason: expect.stringContaining('baseline changed'),
      }),
    ]);
    expect(skipped.files).toEqual(['base/n.png']);
    const forced = approve({
      manifests: [manifest],
      repoRoot: dir.path,
      force: true,
    });
    expect(forced.files).toEqual(['base/a.png']);
  });

  it('skips a missing-baseline entry once a baseline has appeared', async () => {
    const manifest = await run();
    put('base/n.png', makePng(2, 2));
    const result = approve({
      manifests: [manifest],
      repoRoot: dir.path,
      names: ['n'],
    });
    expect(result.skipped[0].reason).toContain('baseline changed');
  });

  it('skips an entry whose actual changed or vanished', async () => {
    const manifest = await run();
    put('base/a.actual.png', makePng(8, 8, [7, 7, 7, 255]));
    fs.rmSync(file('base/n.actual.png'));
    const result = approve({ manifests: [manifest], repoRoot: dir.path });
    expect(result.skipped.map((s) => s.reason)).toEqual([
      expect.stringContaining('actual image changed'),
      expect.stringContaining('actual image is gone'),
    ]);
  });

  it('refuses entries that write one baseline unless one is named', async () => {
    const first = await run('one.json', 'light');
    const second = await run('two.json', 'dark');
    const all = approve({ manifests: [first, second], repoRoot: dir.path });
    expect(all.skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining([expect.stringContaining('same baseline')]),
    );
    expect(all.approved).toEqual([]);
  });

  it('resolves paths of a project below the repository root', async () => {
    const manifest = await run();
    const result = approve({
      manifests: [manifest],
      repoRoot: path.dirname(dir.path),
    });
    expect(result.files[0]).toBe(`${path.basename(dir.path)}/base/a.png`);
  });

  it('refuses a project outside the repository root, so a moved manifest cannot reach the old tree', async () => {
    const manifest = await run();
    const elsewhere = await tmp.dir({ unsafeCleanup: true });
    const result = approve({ manifests: [manifest], repoRoot: elsewhere.path });
    expect(result.approved).toEqual([]);
    expect(result.skipped[0].reason).toContain('--repo-root');
    expect(exists('base/a.actual.png')).toBe(true);
    await elsewhere.cleanup();
  });

  it('approves a manifest without hashes, but not over a baseline that appeared', async () => {
    const manifest = await run();
    const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const entry of json.entries) delete entry.hashes;
    fs.writeFileSync(manifest, JSON.stringify(json));
    put('base/n.png', makePng(2, 2));
    const result = approve({ manifests: [manifest], repoRoot: dir.path });
    expect(result.files).toEqual(['base/a.png']);
    expect(result.skipped).toHaveLength(1);
  });

  it('says so when the entry kept no actual image', async () => {
    const manifest = await run();
    const result = approve({
      manifests: [manifest],
      repoRoot: dir.path,
      names: ['ok'],
    });
    expect(result.skipped[0].reason).toBe(
      'the run kept no actual image for it',
    );
  });

  it('records the size of the approved screenshot as the baseline size', async () => {
    put('base/s.png', makePng(8, 8));
    const comparer = createComparer({
      store: fsStore({ baselineDir: file('base') }),
      manifest: { projectRoot: dir.path, path: file('size.json') },
      concurrency: 1,
    });
    await comparer.compareImage({ name: 's', actual: makePng(8, 12) });
    await comparer.close();
    approve({ manifests: [file('size.json')], repoRoot: dir.path });
    const entry = readManifestFile(file('size.json')).entries[0];
    expect(entry.images.baseline).toMatchObject({ width: 8, height: 12 });
  });

  it('refuses a CI project outside the checkout', async () => {
    const manifest = await run();
    const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    json.ci = { provider: 'github', workspace: '/somewhere/else' };
    fs.writeFileSync(manifest, JSON.stringify(json));
    const result = approve({ manifests: [manifest], repoRoot: dir.path });
    expect(result.approved).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(result.warnings[0]).toContain('outside the checkout');
  });
});
