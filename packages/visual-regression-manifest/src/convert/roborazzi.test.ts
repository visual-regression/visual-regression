import path from 'path';
import { describe, expect, it } from 'vitest';
import { tmpDir, writePng } from '../../__tests__/helpers';
import { validateManifest } from '../reader';
import { fromRoborazziResults, type RoborazziResults } from './roborazzi';

describe('fromRoborazziResults', () => {
  it('converts recorded, added, changed and unchanged results', async () => {
    const root = await tmpDir();
    const out = path.join(root, 'build', 'outputs', 'roborazzi');
    writePng(path.join(out, 'HomeTest.home.png'), 4, 4, 1);
    writePng(path.join(out, 'HomeTest.home_actual.png'), 4, 4, 2);
    writePng(path.join(out, 'HomeTest.home_compare.png'), 12, 4, 3);
    writePng(path.join(out, 'HomeTest.new_actual.png'), 2, 2, 2);
    writePng(path.join(out, 'HomeTest.new_compare.png'), 6, 2, 3);
    writePng(path.join(out, 'HomeTest.same.png'));
    writePng(path.join(out, 'HomeTest.recorded.png'));

    const results: RoborazziResults = {
      summary: { total: 5, recorded: 1, added: 1, changed: 1, unchanged: 1 },
      results: [
        {
          type: 'changed',
          golden_file_path: path.join(out, 'HomeTest.home.png'),
          actual_file_path: path.join(out, 'HomeTest.home_actual.png'),
          compare_file_path: path.join(out, 'HomeTest.home_compare.png'),
          timestamp: 1.7e18,
          diff_percentage: 0.123,
          context_data: { 'roborazzi.test.name': 'home' },
        },
        {
          type: 'added',
          golden_file_path: path.join(out, 'HomeTest.new.png'),
          actual_file_path: path.join(out, 'HomeTest.new_actual.png'),
          compare_file_path: path.join(out, 'HomeTest.new_compare.png'),
          timestamp: 1.7e18,
          context_data: {},
        },
        {
          type: 'unchanged',
          golden_file_path: path.join(out, 'HomeTest.same.png'),
          timestamp: 1.7e18,
        },
        {
          type: 'recorded',
          golden_file_path: path.join(out, 'HomeTest.recorded.png'),
          timestamp: 1.7e18,
        },
        { type: 'mystery', golden_file_path: path.join(out, 'x.png') },
        { type: 'unchanged' },
      ],
    };

    const manifest = fromRoborazziResults(results, {
      projectRoot: root,
      ci: null,
      maxDiffRatio: 0.01,
    });
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.runner).toEqual({ name: 'roborazzi' });
    expect(
      manifest.entries.map((e) => [
        e.name,
        e.status,
        e.comparison.diffRatio,
        e.images.actual.path,
        e.images.diff.path,
        e.baselineWritten,
        e.recordedAt,
      ]),
    ).toEqual([
      [
        'HomeTest.home',
        'failed',
        0.123,
        'build/outputs/roborazzi/HomeTest.home_actual.png',
        'build/outputs/roborazzi/HomeTest.home_compare.png',
        false,
        '2023-11-14T22:13:20.000Z',
      ],
      [
        'HomeTest.new',
        'missing-baseline',
        0,
        'build/outputs/roborazzi/HomeTest.new_actual.png',
        'build/outputs/roborazzi/HomeTest.new_compare.png',
        false,
        '2023-11-14T22:13:20.000Z',
      ],
      [
        'HomeTest.recorded',
        'updated',
        0,
        null,
        null,
        true,
        '2023-11-14T22:13:20.000Z',
      ],
      [
        'HomeTest.same',
        'passed',
        0,
        null,
        null,
        false,
        '2023-11-14T22:13:20.000Z',
      ],
    ]);
    expect(manifest.entries[0]).toMatchObject({
      comparison: { maxDiffRatio: 0.01 },
      target: { kind: 'mobile', os: 'android', emulated: true },
      renderer: { backend: 'emulator', name: 'robolectric' },
      extra: { roborazzi: { 'roborazzi.test.name': 'home' } },
      images: {
        baseline: { width: 4, height: 4 },
        actual: { width: 4, height: 4 },
      },
    });
    expect(manifest.entries[2].extra).toBeUndefined();
    expect(() =>
      fromRoborazziResults({} as never, { projectRoot: root }),
    ).toThrow(/Not a Roborazzi results summary/);
  });
});
