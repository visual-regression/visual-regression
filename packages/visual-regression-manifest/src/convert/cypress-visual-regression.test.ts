import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  expectRealOutput,
  must,
  realOutput,
  tmpDir,
  writePng,
} from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromCypressVisualRegression } from './cypress-visual-regression';

describe('fromCypressVisualRegression', () => {
  // captured by examples/converters/cypress (cypress-visual-regression 6, Cypress 16,
  // Electron): a regression run after one base run, one base deleted
  describe.each(realOutput('cypress').filter(({ mode }) => mode === 'cvr'))(
    'real output of a $mode run',
    ({ root, expectations }) => {
      it('matches the actual screenshots below the spec prefix Cypress adds to the base images', () => {
        const manifest = fromCypressVisualRegression({
          projectRoot: root,
          ci: null,
          maxDiffRatio: 0,
        });
        expectRealOutput(manifest, root, expectations);
        expect(manifest.runner).toEqual({ name: 'cypress' });
        const failed = must(manifest.entries.find((e) => e.name === 'box-b'));
        expect(failed).toMatchObject({
          status: 'failed',
          test: { filePath: 'cypress/e2e/cvr/box.cy.js' },
          images: {
            baseline: {
              path: 'cypress/snapshots/base/cypress/e2e/cvr/box.cy.js/box-b.png',
            },
            actual: {
              path: 'cypress/snapshots/actual/box.cy.js/cypress/e2e/cvr/box.cy.js/box-b.png',
            },
            diff: {
              path: 'cypress/snapshots/diff/cypress/e2e/cvr/box.cy.js/box-b.png',
            },
          },
        });
        const missing = must(manifest.entries.find((e) => e.name === 'box-c'));
        expect(missing).toMatchObject({
          status: 'missing-baseline',
          images: {
            baseline: {
              path: 'cypress/snapshots/base/cypress/e2e/cvr/box.cy.js/box-c.png',
            },
            actual: {
              path: 'cypress/snapshots/actual/box.cy.js/cypress/e2e/cvr/box.cy.js/box-c.png',
            },
            diff: { path: null },
          },
        });
      });
    },
  );

  it('finds the spec prefix of an actual without a base image by its shape', async () => {
    const root = await tmpDir();
    const actual = path.join(root, 'cypress', 'snapshots', 'actual');
    // a run of several specs: the prefix is the spec path below their common ancestor
    writePng(
      path.join(
        actual,
        'cvr',
        'box.cy.js',
        'cypress',
        'e2e',
        'cvr',
        'box.cy.js',
        'new.png',
      ),
    );
    // a run of one spec: the prefix is the spec file name
    writePng(
      path.join(
        actual,
        'about.cy.js',
        'cypress',
        'e2e',
        'about.cy.js',
        'intro.png',
      ),
    );
    const manifest = fromCypressVisualRegression({
      projectRoot: root,
      ci: null,
    });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.test.filePath,
        e.images.baseline.path,
      ]),
    ).toEqual([
      [
        'intro',
        'missing-baseline',
        'cypress/e2e/about.cy.js',
        'cypress/snapshots/base/cypress/e2e/about.cy.js/intro.png',
      ],
      [
        'new',
        'missing-baseline',
        'cypress/e2e/cvr/box.cy.js',
        'cypress/snapshots/base/cypress/e2e/cvr/box.cy.js/new.png',
      ],
    ]);
  });

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
