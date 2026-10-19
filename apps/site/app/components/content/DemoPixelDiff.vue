<script setup lang="ts">
// Chapter 2: the two limits, on real pixels. Two renders of the mock
// screen are compared with the pixelmatch rule in `utils/pixelDiff.ts`;
// the checkboxes choose what differs, the sliders set the limits.
const SCALE = 1; // 240×150: small enough that single pixels show when enlarged

const textShift = ref(true);
const buttonTint = ref(true);
const priceChange = ref(false);
const threshold = ref(0.1);
const includeAA = ref(false);
const maxRatio = ref(0.0005);

const baselineCanvas = ref<HTMLCanvasElement | null>(null);
const actualCanvas = ref<HTMLCanvasElement | null>(null);
const diffCanvas = ref<HTMLCanvasElement | null>(null);
const result = ref<{ count: number; ratio: number; aaSkipped: number; total: number } | null>(null);

const put = (canvas: HTMLCanvasElement | null, data: ImageData) => {
  if (!canvas) return;
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
};

const run = () => {
  const baseline = renderMockScreen({ scale: SCALE });
  const actual = renderMockScreen({
    scale: SCALE,
    textNudge: textShift.value ? 0.35 : 0,
    // emerald 600 instead of 500: a YIQ distance just above pixelmatch's default 0.1
    buttonColor: buttonTint.value ? '#059669' : '#10b981',
    price: priceChange.value ? '$45.00' : '$42.00',
  });
  const r = pixelDiff(baseline, actual, { threshold: threshold.value, includeAA: includeAA.value });
  put(baselineCanvas.value, baseline);
  put(actualCanvas.value, actual);
  put(diffCanvas.value, r.diff);
  result.value = { count: r.count, ratio: r.ratio, aaSkipped: r.aaSkipped, total: baseline.width * baseline.height };
};

// the canvases appear once ClientOnly renders its slot, after this component mounted
watch(diffCanvas, (c) => c && run());
watch([textShift, buttonTint, priceChange, threshold, includeAA], run);

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const passed = computed(() => (result.value ? result.value.ratio <= maxRatio.value : true));
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <figure class="min-w-0">
          <canvas ref="baselineCanvas" class="w-full rounded border border-default [image-rendering:pixelated]" aria-label="baseline image"></canvas>
          <figcaption class="mt-1 font-mono text-xs text-muted">baseline</figcaption>
        </figure>
        <figure class="min-w-0">
          <canvas ref="actualCanvas" class="w-full rounded border border-default [image-rendering:pixelated]" aria-label="actual image"></canvas>
          <figcaption class="mt-1 font-mono text-xs text-muted">actual</figcaption>
        </figure>
        <figure class="min-w-0">
          <canvas ref="diffCanvas" class="w-full rounded border border-default [image-rendering:pixelated]" aria-label="diff image"></canvas>
          <figcaption class="mt-1 font-mono text-xs text-muted">diff (red differs, amber skipped as anti-aliasing)</figcaption>
        </figure>
      </div>

      <div class="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div class="space-y-2">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">What changed in the actual</p>
          <UCheckbox v-model="textShift" label="Text drawn 0.35px to the right (another machine's rasteriser)" />
          <UCheckbox v-model="buttonTint" label="Button one shade darker (rgb 5,150,105 instead of 16,185,129)" />
          <UCheckbox v-model="priceChange" label="Price $45.00 instead of $42.00 (a real change)" />
        </div>
        <div class="space-y-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">What the comparator is told</p>
          <label class="block">
            <span class="flex justify-between font-mono text-xs"><span>colour tolerance (threshold)</span><span>{{ threshold.toFixed(2) }}</span></span>
            <input v-model.number="threshold" type="range" min="0" max="1" step="0.01" class="w-full accent-primary" />
          </label>
          <UCheckbox v-model="includeAA" label="Count anti-aliased pixels too (includeAA)" />
          <label class="block">
            <span class="flex justify-between font-mono text-xs"><span>max diff ratio (maxDiffPixelRatio)</span><span>{{ pct(maxRatio) }}</span></span>
            <input v-model.number="maxRatio" type="range" min="0" max="0.02" step="0.0005" class="w-full accent-primary" />
          </label>
        </div>
      </div>

      <p v-if="result" class="rounded-md border border-default bg-elevated px-3 py-2 font-mono text-xs">
        <span :class="passed ? 'text-success' : 'text-error'">{{ passed ? 'passed' : 'failed' }}</span>
        · {{ result.count }} of {{ result.total }} pixels differ ({{ pct(result.ratio) }})
        <template v-if="!includeAA"> · {{ result.aaSkipped }} skipped as anti-aliasing (amber)</template>
        · allowed {{ pct(maxRatio) }}
      </p>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        The demo compares pixels in your browser; enable JavaScript to try it.
      </div>
    </template>
  </ClientOnly>
</template>
