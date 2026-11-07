import path from 'path';
import { describe, expect, it } from 'vitest';
import { tmpDir, writePng } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromLoki, lokiSlug } from './loki';

describe('lokiSlug', () => {
  it('slugifies the way loki names its files', () => {
    expect(lokiSlug('chrome.laptop')).toBe('chrome_laptop');
    expect(lokiSlug('Components/Button')).toBe('Components_Button');
    expect(lokiSlug(' with spaces ')).toBe('with_spaces');
  });
});

// Not proven against a real run: Loki needs Storybook plus Chrome (an app or a
// Docker image), which the converter examples do not drive. The layout is the
// documented one: `.loki/reference`, `.loki/current` and `.loki/difference` with
// `<configuration>_<kind>_<story>.png` files.
describe('fromLoki', () => {
  it('reads the reference, current and difference folders', async () => {
    const root = await tmpDir();
    const loki = path.join(root, '.loki');
    // changed: reference, current and difference
    writePng(
      path.join(loki, 'reference', 'chrome_laptop_Button_Primary.png'),
      4,
      4,
      1,
    );
    writePng(
      path.join(loki, 'current', 'chrome_laptop_Button_Primary.png'),
      4,
      4,
      2,
    );
    writePng(
      path.join(loki, 'difference', 'chrome_laptop_Button_Primary.png'),
      4,
      4,
      3,
    );
    // unchanged: the current image stays next to the reference
    writePng(
      path.join(loki, 'reference', 'chrome_laptop_Button_Secondary.png'),
    );
    writePng(path.join(loki, 'current', 'chrome_laptop_Button_Secondary.png'));
    // not shot in this run: only the reference
    writePng(path.join(loki, 'reference', 'chrome_iphone7_Button_Primary.png'));
    // not recorded: only the current image
    writePng(path.join(loki, 'current', 'chrome_laptop_Button_Link.png'));
    const manifest = fromLoki({
      projectRoot: root,
      ci: null,
      configurations: ['chrome.laptop', 'chrome.iphone7'],
      tolerance: 2.3,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'loki' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.variant,
        e.images.baseline.path,
        e.images.actual.path,
        e.images.diff.path,
      ]),
    ).toEqual([
      [
        'chrome_laptop_Button_Link',
        'missing-baseline',
        'chrome.laptop',
        '.loki/reference/chrome_laptop_Button_Link.png',
        '.loki/current/chrome_laptop_Button_Link.png',
        null,
      ],
      [
        'chrome_laptop_Button_Primary',
        'failed',
        'chrome.laptop',
        '.loki/reference/chrome_laptop_Button_Primary.png',
        '.loki/current/chrome_laptop_Button_Primary.png',
        '.loki/difference/chrome_laptop_Button_Primary.png',
      ],
      [
        'chrome_laptop_Button_Secondary',
        'passed',
        'chrome.laptop',
        '.loki/reference/chrome_laptop_Button_Secondary.png',
        null,
        null,
      ],
    ]);
    expect(manifest.extra).toEqual({
      loki: {
        referencesWithoutShot: ['chrome_iphone7_Button_Primary.png'],
      },
    });
    expect(manifest.entries[1]).toMatchObject({
      comparison: {
        diffRatio: 0,
        maxDiffRatio: 0,
        colorThreshold: 0.023,
        colorMetric: 'yiq',
      },
      images: {
        baseline: { width: 4, height: 4 },
        actual: { width: 4, height: 4 },
      },
    });
  });

  it('honors custom folders, a custom formatter without known configurations and other engines', async () => {
    const root = await tmpDir();
    writePng(path.join(root, 'ref', 'Button-Primary.png'));
    writePng(path.join(root, 'out', 'Button-Primary.png'));
    writePng(path.join(root, 'dif', 'Button-Primary.png'));
    const manifest = fromLoki({
      projectRoot: root,
      ci: null,
      runner: { name: 'loki', version: '0.35.0' },
      referenceDir: 'ref',
      currentDir: 'out',
      differenceDir: 'dif',
      diffingEngine: 'looks-same',
    });
    expect(manifest.runner).toEqual({ name: 'loki', version: '0.35.0' });
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      name: 'Button-Primary',
      status: 'failed',
      comparison: { diffRatio: 0 },
      images: { diff: { path: 'dif/Button-Primary.png' } },
    });
    expect(manifest.entries[0].comparison).not.toHaveProperty('maxDiffRatio');
    expect(manifest.entries[0].variant).toBeUndefined();
  });
});
