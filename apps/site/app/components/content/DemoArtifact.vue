<script setup lang="ts">
// Chapter 5: what a run leaves on the runner's disk, and which of those files
// make it into the uploaded artifact. Five screenshots of the mock checkout
// are compared for real (two fail), encoded as PNG, and the artifact size is
// the sum of the included files. "Open in the viewer" hands the artifact to
// the viewer page the way an unpacked download would.
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
  { name: 'checkout-progress', title: 'shows the progress bar', baseline: { animation: 0.5 }, actual: { animation: 0.5 } },
  { name: 'checkout-focused', title: 'focuses the email field', baseline: { caret: true }, actual: { caret: true } },
  { name: 'buy-button', title: 'shows the buy button', baseline: { buttonColor: '#18181b' }, actual: { buttonColor: '#10b981', buttonWidth: 76 } },
  { name: 'total-price', title: 'formats the total', baseline: {}, actual: { price: '$4.20' } },
];

type Role = 'baseline' | 'actual' | 'diff' | 'manifest';
interface Produced {
  path: string;
  role: Role;
  test: string;
  status: 'passed' | 'failed';
  blob: Blob;
}
interface Result {
  test: Test;
  status: 'passed' | 'failed';
  ratio: number;
  width: number;
  height: number;
}

const includeBaselines = ref(true);
const includeManifest = ref(true);
const onlyFailures = ref(false);
const produced = ref<Produced[]>([]);
const results = ref<Result[]>([]);
const ready = ref(false);

const toPng = (data: ImageData) =>
  new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });

const baselinePath = (t: Test) => `e2e/__screenshots__/${t.name}.png`;
const actualPath = (t: Test) => `test-results/${t.name}/actual.png`;
const diffPath = (t: Test) => `test-results/${t.name}/diff.png`;

const manifestFor = (rs: Result[]) => {
  const now = new Date().toISOString();
  const entries = rs.map(({ test, status, ratio, width, height }) => ({
    name: test.name,
    test: { filePath: SPEC_FILE, titlePath: ['checkout', test.title], retry: 0 },
    status,
    comparison: { diffRatio: ratio, threshold: MAX_RATIO },
    images: {
      baseline: { path: baselinePath(test), width, height },
      actual: status === 'failed' ? { path: actualPath(test), width, height } : { path: null },
      diff: { path: status === 'failed' ? diffPath(test) : null },
    },
    baselineWritten: false,
    recordedAt: now,
    platform: { osPlatform: 'linux', browser: { name: 'chromium', version: '142' } },
    viewport: { width, height },
    message: status === 'failed' ? `${(ratio * 100).toFixed(2)}% of pixels differ, allowed ${(MAX_RATIO * 100).toFixed(2)}%` : '',
  }));
  const failed = entries.filter((e) => e.status === 'failed').length;
  return {
    reportFormat: 'visual-regression-manifest',
    specVersion: '1.0.0-beta.1',
    createdAt: now,
    updatedAt: now,
    projectRoot: '/home/runner/work/shop/shop',
    platform: { osPlatform: 'linux', osVersion: 'ubuntu-24.04', nodeVersion: 'v24.0.0' },
    ci: { provider: 'github', buildId: '38649941412', runAttempt: '1', branch: 'feature/green-button', commit: 'a31e94c', pullRequest: { number: 42 } },
    tool: { name: 'visual-regression.dev demo', version: '1' },
    options: {},
    runner: { name: 'playwright', version: '1.58.0' },
    summary: { entries: entries.length, passed: entries.length - failed, failed, missingBaseline: 0, created: 0, updated: 0, approved: 0, needsHuman: failed },
    entries,
  };
};

const generate = async () => {
  const files: Produced[] = [];
  const rs: Result[] = [];
  for (const test of TESTS) {
    const baseline = renderMockScreen({ scale: SCALE, ...test.baseline });
    const actual = renderMockScreen({ scale: SCALE, ...test.actual });
    const r = pixelDiff(baseline, actual);
    const status = r.ratio > MAX_RATIO ? 'failed' : 'passed';
    rs.push({ test, status, ratio: r.ratio, width: baseline.width, height: baseline.height });
    files.push({ path: baselinePath(test), role: 'baseline', test: test.name, status, blob: await toPng(baseline) });
    // like most tools, the run writes the actual and the diff only when the comparison failed
    if (status === 'failed') {
      files.push({ path: actualPath(test), role: 'actual', test: test.name, status, blob: await toPng(actual) });
      files.push({ path: diffPath(test), role: 'diff', test: test.name, status, blob: await toPng(r.diff) });
    }
  }
  const json = JSON.stringify(manifestFor(rs), null, 2);
  files.push({ path: 'visual-regression-manifest.json', role: 'manifest', test: '', status: 'passed', blob: new Blob([json], { type: 'application/json' }) });
  results.value = rs;
  produced.value = files.sort((a, b) => a.path.localeCompare(b.path));
  ready.value = true;
};
onMounted(generate);

const included = (f: Produced) =>
  f.role === 'manifest'
    ? includeManifest.value
    : (f.role !== 'baseline' || includeBaselines.value) && (!onlyFailures.value || f.status === 'failed');
const artifact = computed(() => produced.value.filter(included));
const bytes = computed(() => artifact.value.reduce((n, f) => n + f.blob.size, 0));
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const failed = computed(() => results.value.filter((r) => r.status === 'failed').length);

const can = computed(() => [
  { ok: true, text: `See the actual image of each of the ${failed.value} failures` },
  includeBaselines.value
    ? { ok: true, text: 'Compare each one against the baseline it failed against' }
    : { ok: false, text: 'No baseline in the artifact: check out the commit and dig the baseline out of git' },
  includeManifest.value
    ? { ok: true, text: `Know that ${failed.value} of ${results.value.length} screenshots failed, and by how much, without opening a folder` }
    : { ok: false, text: 'No manifest: walk the folders and match file names by hand to work out what failed' },
  onlyFailures.value
    ? { ok: false, text: 'The passing screenshots stayed on the runner; nobody can double-check them' }
    : { ok: true, text: 'Double-check the passing screenshots too' },
]);

const openInViewer = () => {
  useDemoRun().set(
    artifact.value.map((f) => ({
      path: f.path,
      file: new File([f.blob], f.path.split('/').pop()!, { type: f.blob.type }),
    })),
  );
  return navigateTo('/viewer');
};
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-4">
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <UCheckbox v-model="includeBaselines" label="Include the baselines" />
        <UCheckbox v-model="includeManifest" label="Include the manifest" />
        <UCheckbox v-model="onlyFailures" label="Only the failures' images" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="min-w-0 rounded-lg border border-default">
          <p class="flex flex-wrap items-baseline gap-x-2 border-b border-default bg-elevated px-3 py-2 text-xs">
            <span class="font-medium uppercase tracking-wide text-muted">The artifact</span>
            <span v-if="ready" class="ml-auto font-mono text-muted">{{ artifact.length }} files · {{ kb(bytes) }}</span>
          </p>
          <ul v-if="ready" class="px-3 py-2 font-mono text-xs leading-6">
            <li
              v-for="f in produced"
              :key="f.path"
              class="flex gap-2 wrap-anywhere"
              :class="included(f) ? '' : 'text-dimmed line-through decoration-dimmed'"
            >
              <span class="min-w-0 flex-1">{{ f.path }}</span>
              <span class="shrink-0 text-muted">{{ kb(f.blob.size) }}</span>
            </li>
          </ul>
          <p v-else class="px-3 py-6 text-center text-xs text-muted">Rendering the run…</p>
          <p class="border-t border-default px-3 py-2 text-xs text-muted">
            Struck-through files stay on the runner and disappear with the job.
          </p>
        </section>

        <section class="min-w-0 rounded-lg border border-default">
          <p class="border-b border-default bg-elevated px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            What a reviewer can do with it
          </p>
          <ul class="space-y-2 px-3 py-3 text-sm">
            <li v-for="c in can" :key="c.text" class="flex gap-2">
              <UIcon :name="c.ok ? 'i-lucide-check' : 'i-lucide-x'" class="mt-0.5 size-4 shrink-0" :class="c.ok ? 'text-success' : 'text-error'" />
              <span>{{ c.text }}</span>
            </li>
          </ul>
          <div class="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2">
            <UButton size="xs" color="primary" :disabled="!ready || !includeManifest" trailing-icon="i-lucide-arrow-right" @click="openInViewer">
              Open in the viewer
            </UButton>
            <span v-if="!includeManifest" class="text-xs text-muted">The viewer needs the manifest to know what to show.</span>
          </div>
        </section>
      </div>
      <p class="text-xs text-muted">
        The run is five screenshots of the mock checkout, compared in your browser. Sizes are those of the PNG files it
        produced. Real full-page screenshots are many times larger, so "only the failures' images" matters more there.
      </p>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        The demo renders the run in your browser; enable JavaScript to try it.
      </div>
    </template>
  </ClientOnly>
</template>
