import path from 'path';
import { describe, expect, it } from 'vitest';
import { tmpDir, writePng } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromCypressVisualRegression } from './cypress-visual-regression';

describe('fromCypressVisualRegression', () => {
  it('reads the base, actual and diff folders', async () => {
    const root = await tmpDir();
    const snapshots = path.join(root, 'cypress', 'snapshots');
    writePng(path.join(snapshots, 'base', 'home.cy.ts', 'hero.png'), 4, 4, 1);
    writePng(path.join(snapshots, 'actual', 'home.cy.ts', 'hero.png'), 4, 4, 2);
    writePng(path.join(snapshots, 'diff', 'home.cy.ts', 'hero.png'), 4, 4, 3);
    writePng(path.join(snapshots, 'base', 'home.cy.ts', 'footer.png'));
    writePng(path.join(snapshots, 'actual', 'home.cy.ts', 'footer.png'));
    writePng(path.join(snapshots, 'actual', 'about.cy.ts', 'intro.png'));

    const manifest = fromCypressVisualRegression({
      projectRoot: root,
      ci: null,
      maxDiffRatio: 0.05,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'cypress' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.test.filePath,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
      ]),
    ).toEqual([
      [
        'intro',
        'missing-baseline',
        'about.cy.ts',
        'cypress/snapshots/base/about.cy.ts/intro.png',
        'cypress/snapshots/actual/about.cy.ts/intro.png',
        null,
      ],
      [
        'footer',
        'passed',
        'home.cy.ts',
        'cypress/snapshots/base/home.cy.ts/footer.png',
        null,
        null,
      ],
      [
        'hero',
        'failed',
        'home.cy.ts',
        'cypress/snapshots/base/home.cy.ts/hero.png',
        'cypress/snapshots/actual/home.cy.ts/hero.png',
        'cypress/snapshots/diff/home.cy.ts/hero.png',
      ],
    ]);
    expect(manifest.entries[2].comparison.maxDiffRatio).toBe(0.05);
  });

  it('honors custom directories and the generateDiff mode', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'b', 'x.png'));
    writePng(path.join(root, 'a', 'x.png'));
    writePng(path.join(root, 'd', 'x.png'));

    const custom = {
      projectRoot: root,
      ci: null,
      baseDirectory: 'b',
      actualDirectory: 'a',
      diffDirectory: 'd',
    };
    expect(
      fromCypressVisualRegression({ ...custom, generateDiff: 'always' })
        .entries[0],
    ).toMatchObject({ name: 'x', status: 'failed', test: { filePath: '' } });
    expect(
      fromCypressVisualRegression({ ...custom, generateDiff: 'never' })
        .entries[0],
    ).toMatchObject({ status: 'passed' });
  });
});
