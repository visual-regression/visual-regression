// The run behind chapter 5's artifact demo: five screenshots of the mock
// checkout are compared for real (two fail), encoded as PNG, and described by a
// manifest. It is deterministic, so the viewer can regenerate it from a URL.
import { renderMockScreen, type MockScreenOptions } from './mockScreen';
import { pixelDiff } from './pixelDiff';

const SCALE = 2;
const MAX_RATIO = 0.0005;
const SPEC_FILE = 'e2e/checkout.spec.ts';

interface Test {
  name: string;
  title: string;
  baseline: MockScreenOptions;
  actual: MockScreenOptions;
}
const TESTS: Test[] = [
  { name: 'checkout', title: 'renders the checkout', baseline: {}, actual: {} },
  {
    name: 'checkout-progress',
    title: 'shows the progress bar',
    baseline: { animation: 0.5 },
    actual: { animation: 0.5 },
  },
  {
    name: 'checkout-focused',
    title: 'focuses the email field',
    baseline: { caret: true },
    actual: { caret: true },
  },
  {
    name: 'buy-button',
    title: 'shows the buy button',
    baseline: { buttonColor: '#18181b' },
    actual: { buttonColor: '#10b981', buttonWidth: 76 },
  },
  {
    name: 'total-price',
    title: 'formats the total',
    baseline: {},
    actual: { price: '$4.20' },
  },
];

export type DemoRole = 'baseline' | 'actual' | 'diff' | 'manifest';
export interface DemoProduced {
  path: string;
  role: DemoRole;
  test: string;
  status: 'passed' | 'failed';
  blob: Blob;
}
export interface DemoResult {
  test: Test;
  status: 'passed' | 'failed';
  ratio: number;
  width: number;
  height: number;
}
export interface DemoOptions {
  baselines: boolean;
  manifest: boolean;
  onlyFailures: boolean;
}

export const DEMO_RUN_ID = 'ci';
export const DEFAULT_DEMO_OPTIONS: DemoOptions = {
  baselines: true,
  manifest: true,
  onlyFailures: false,
};

const toPng = (data: ImageData) =>
  new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });

const baselinePath = (t: Test) => `e2e/__screenshots__/${t.name}.png`;
const actualPath = (t: Test) => `test-results/${t.name}/actual.png`;
const diffPath = (t: Test) => `test-results/${t.name}/diff.png`;

const manifestFor = (rs: DemoResult[]) => {
  const now = new Date().toISOString();
  const entries = rs.map(({ test, status, ratio, width, height }) => ({
    name: test.name,
    test: {
      filePath: SPEC_FILE,
      titlePath: ['checkout', test.title],
      retry: 0,
    },
    status,
    comparison: {
      diffRatio: ratio,
      maxDiffRatio: MAX_RATIO,
      colorThreshold: 0.1,
      colorMetric: 'yiq',
    },
    images: {
      baseline: { path: baselinePath(test), width, height },
      actual:
        status === 'failed'
          ? { path: actualPath(test), width, height }
          : { path: null },
      diff: { path: status === 'failed' ? diffPath(test) : null },
    },
    baselineWritten: false,
    recordedAt: now,
    platform: {
      osPlatform: 'linux',
      browser: { name: 'chromium', version: '142' },
    },
    viewport: { width, height },
    message:
      status === 'failed'
        ? `${(ratio * 100).toFixed(2)}% of pixels differ, allowed ${(MAX_RATIO * 100).toFixed(2)}%`
        : '',
  }));
  const failed = entries.filter((e) => e.status === 'failed').length;
  return {
    reportFormat: 'visual-regression-manifest',
    specVersion: '1.0.0-beta.1',
    createdAt: now,
    updatedAt: now,
    projectRoot: '/home/runner/work/shop/shop',
    platform: {
      osPlatform: 'linux',
      osVersion: 'ubuntu-24.04',
      nodeVersion: 'v24.0.0',
    },
    ci: {
      provider: 'github',
      buildId: '38649941412',
      runAttempt: '1',
      branch: 'feature/green-button',
      commit: 'a31e94c',
      pullRequest: { number: 42 },
    },
    tool: { name: 'visual-regression.dev demo', version: '1' },
    options: {},
    runner: { name: 'playwright', version: '1.58.0' },
    summary: {
      entries: entries.length,
      passed: entries.length - failed,
      failed,
      missingBaseline: 0,
      created: 0,
      updated: 0,
      approved: 0,
      needsHuman: failed,
    },
    entries,
  };
};

export const generateDemoRun = async () => {
  const files: DemoProduced[] = [];
  const results: DemoResult[] = [];
  for (const test of TESTS) {
    const baseline = renderMockScreen({ scale: SCALE, ...test.baseline });
    const actual = renderMockScreen({ scale: SCALE, ...test.actual });
    const r = pixelDiff(baseline, actual);
    const status = r.ratio > MAX_RATIO ? 'failed' : 'passed';
    results.push({
      test,
      status,
      ratio: r.ratio,
      width: baseline.width,
      height: baseline.height,
    });
    files.push({
      path: baselinePath(test),
      role: 'baseline',
      test: test.name,
      status,
      blob: await toPng(baseline),
    });
    // like most tools, the run writes the actual and the diff only when the comparison failed
    if (status === 'failed') {
      files.push({
        path: actualPath(test),
        role: 'actual',
        test: test.name,
        status,
        blob: await toPng(actual),
      });
      files.push({
        path: diffPath(test),
        role: 'diff',
        test: test.name,
        status,
        blob: await toPng(r.diff),
      });
    }
  }
  const json = JSON.stringify(manifestFor(results), null, 2);
  files.push({
    path: 'visual-regression-manifest.json',
    role: 'manifest',
    test: '',
    status: 'passed',
    blob: new Blob([json], { type: 'application/json' }),
  });
  return {
    produced: files.sort((a, b) => a.path.localeCompare(b.path)),
    results,
  };
};

export const isInDemoArtifact = (f: DemoProduced, o: DemoOptions) =>
  f.role === 'manifest'
    ? o.manifest
    : (f.role !== 'baseline' || o.baselines) &&
      (!o.onlyFailures || f.status === 'failed');

/** Only the options that differ from the defaults, as `?demo=ci&baselines=0`. */
export const demoQuery = (o: DemoOptions) => ({
  demo: DEMO_RUN_ID,
  ...(o.baselines ? {} : { baselines: '0' }),
  ...(o.manifest ? {} : { manifest: '0' }),
  ...(o.onlyFailures ? { failures: '1' } : {}),
});

export const demoOptionsFromQuery = (
  q: Record<string, unknown>,
): DemoOptions => ({
  baselines: q.baselines !== '0',
  manifest: q.manifest !== '0',
  onlyFailures: q.failures === '1',
});

export const toDemoFiles = (produced: DemoProduced[], o: DemoOptions) =>
  produced
    .filter((f) => isInDemoArtifact(f, o))
    .map((f) => ({
      path: f.path,
      file: new File([f.blob], f.path.split('/').pop()!, { type: f.blob.type }),
    }));
