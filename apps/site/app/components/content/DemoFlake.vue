<script setup lang="ts">
// Chapter 3: the usual suspects, each a checkbox on the "actual" render, and
// the fix that cancels it. The comparison is real (pixelmatch's rule at the
// defaults: threshold 0.1, anti-aliasing ignored) with 0.05% of pixels allowed.
interface Cause {
  key: string;
  cause: string;
  fix: string;
}
const CAUSES: Cause[] = [
  { key: 'renderer', cause: 'Different machine: text rasterised 0.4px off', fix: 'Pin the renderer (Docker image, bundled fonts)' },
  { key: 'font', cause: 'Web font still loading, heading in the fallback serif', fix: 'Wait for document.fonts.ready' },
  { key: 'animation', cause: 'Progress bar caught mid-animation', fix: 'Disable animations before capturing' },
  { key: 'clock', cause: 'The clock shows the current time', fix: 'Freeze the clock, or mask the region' },
  { key: 'caret', cause: 'A blinking caret in the focused input', fix: 'Blur the input, or hide the caret' },
  { key: 'scrollbar', cause: 'A scrollbar appeared and shifted the layout', fix: 'Hide scrollbars for screenshots' },
];

const on = reactive<Record<string, boolean>>(Object.fromEntries(CAUSES.map((c) => [c.key, false])));
const fixed = reactive<Record<string, boolean>>(Object.fromEntries(CAUSES.map((c) => [c.key, false])));
const active = (key: string) => on[key] && !fixed[key];

const actualCanvas = ref<HTMLCanvasElement | null>(null);
const diffCanvas = ref<HTMLCanvasElement | null>(null);
const result = ref<{ count: number; ratio: number } | null>(null);
const MAX_RATIO = 0.0005;

const now = () => new Date().toTimeString().slice(0, 8);

const put = (canvas: HTMLCanvasElement | null, data: ImageData) => {
  if (!canvas) return;
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
};

const run = () => {
  // a mask applies to both images, the way a tool's `mask` option does
  const baseline = renderMockScreen({ maskClock: on.clock && fixed.clock });
  const actual = renderMockScreen({
    textNudge: active('renderer') ? 0.4 : 0,
    fontFallback: active('font'),
    animation: active('animation') ? 0.37 : 1,
    clock: active('clock') ? now() : '10:42:07',
    maskClock: on.clock && fixed.clock,
    caret: active('caret'),
    scrollbar: active('scrollbar'),
  });
  const r = pixelDiff(baseline, actual);
  put(actualCanvas.value, actual);
  put(diffCanvas.value, r.diff);
  result.value = { count: r.count, ratio: r.ratio };
};

// the canvases appear once ClientOnly renders its slot, after this component mounted
watch(diffCanvas, (c) => c && run());
watch(
  on,
  () => CAUSES.forEach((c) => !on[c.key] && (fixed[c.key] = false)),
  { deep: true },
);
watch([on, fixed], run, { deep: true });

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const passed = computed(() => (result.value ? result.value.ratio <= MAX_RATIO : true));
const everythingOn = () => CAUSES.forEach((c) => (on[c.key] = true));
const reset = () => CAUSES.forEach((c) => ((on[c.key] = false), (fixed[c.key] = false)));
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <figure class="min-w-0">
          <canvas ref="actualCanvas" class="w-full rounded border border-default" aria-label="actual image"></canvas>
          <figcaption class="mt-1 font-mono text-xs text-muted">actual (the baseline is the same screen, rendered cleanly)</figcaption>
        </figure>
        <figure class="min-w-0">
          <canvas ref="diffCanvas" class="w-full rounded border border-default" aria-label="diff image"></canvas>
          <figcaption class="mt-1 font-mono text-xs text-muted">diff</figcaption>
        </figure>
      </div>

      <ul class="divide-y divide-default rounded-lg border border-default text-sm">
        <li class="hidden gap-4 bg-elevated px-3 py-2 text-xs uppercase tracking-wide text-muted sm:grid sm:grid-cols-2">
          <span>What went wrong</span><span>The fix</span>
        </li>
        <li v-for="c in CAUSES" :key="c.key" class="grid gap-2 px-3 py-2 sm:grid-cols-2 sm:gap-4">
          <UCheckbox v-model="on[c.key]" :label="c.cause" />
          <UCheckbox v-model="fixed[c.key]" :label="c.fix" :disabled="!on[c.key]" class="pl-6 sm:pl-0" />
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-2">
        <p v-if="result" class="rounded-md border border-default bg-elevated px-3 py-2 font-mono text-xs">
          <span :class="passed ? 'text-success' : 'text-error'">{{ passed ? 'passed' : 'failed' }}</span>
          · {{ pct(result.ratio) }} of pixels differ · allowed {{ pct(MAX_RATIO) }}
        </p>
        <UButton size="xs" variant="outline" color="neutral" class="ml-auto" @click="everythingOn">Break everything</UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="reset">Reset</UButton>
      </div>
      <p class="text-xs text-muted">
        Nothing in the code changed between the two renders. Every red pixel is noise, and each fix removes its own share.
        Raising the allowed ratio instead would hide a real regression of the same size.
      </p>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        The demo compares pixels in your browser; enable JavaScript to try it.
      </div>
    </template>
  </ClientOnly>
</template>
