<script setup lang="ts">
// Chapter 1: the three files per screenshot. A baseline and an actual of the
// same fictional screen, a slider between them, and the diff image a tool
// would write. The one change: the "Buy now" button is wider and green.
// The numbers are measured with the comparator from chapter 2.
const SCALE = 3;
const THRESHOLD = 0.01;

const cut = ref(50);
const view = ref<'slider' | 'diff'>('slider');
const box = ref<HTMLElement | null>(null);
const baselineCanvas = ref<HTMLCanvasElement | null>(null);
const actualCanvas = ref<HTMLCanvasElement | null>(null);
const diffCanvas = ref<HTMLCanvasElement | null>(null);
const ratio = ref<number | null>(null);

const put = (canvas: HTMLCanvasElement | null, data: ImageData) => {
  if (!canvas) return;
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
};
const run = () => {
  const baseline = renderMockScreen({ scale: SCALE, buttonColor: '#18181b' });
  const actual = renderMockScreen({ scale: SCALE, buttonColor: '#10b981', buttonWidth: 76 });
  const r = pixelDiff(baseline, actual);
  put(baselineCanvas.value, baseline);
  put(actualCanvas.value, actual);
  put(diffCanvas.value, r.diff);
  ratio.value = r.ratio;
};
// the canvases appear once ClientOnly renders its slot, after this component mounted
watch(diffCanvas, (c) => c && run());

let dragging = false;
const fromPointer = (e: PointerEvent) => {
  const r = box.value?.getBoundingClientRect();
  if (!r) return;
  cut.value = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
};
const down = (e: PointerEvent) => {
  dragging = true;
  fromPointer(e);
};
const move = (e: PointerEvent) => dragging && fromPointer(e);
const up = () => (dragging = false);
onMounted(() => {
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
});
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-3">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <UButton size="xs" :variant="view === 'slider' ? 'solid' : 'outline'" color="neutral" @click="view = 'slider'">
          Baseline / actual
        </UButton>
        <UButton size="xs" :variant="view === 'diff' ? 'solid' : 'outline'" color="neutral" @click="view = 'diff'">
          Diff image
        </UButton>
        <span v-if="ratio !== null" class="ml-auto font-mono text-xs text-muted">
          status: <span :class="ratio > THRESHOLD ? 'text-error' : 'text-success'">{{ ratio > THRESHOLD ? 'failed' : 'passed' }}</span>
          · diffRatio {{ ratio.toFixed(3) }} · threshold {{ THRESHOLD }}
        </span>
      </div>

      <div
        ref="box"
        class="relative max-w-xl touch-none select-none overflow-hidden rounded-lg border border-default"
        :class="view === 'slider' && 'cursor-ew-resize'"
        @pointerdown="view === 'slider' && down($event)"
      >
        <canvas ref="baselineCanvas" class="block w-full" aria-label="baseline image"></canvas>
        <canvas
          ref="actualCanvas"
          class="absolute inset-0 block w-full"
          :class="view === 'diff' && 'invisible'"
          :style="{ clipPath: `inset(0 0 0 ${cut}%)` }"
          aria-label="actual image"
        ></canvas>
        <canvas ref="diffCanvas" class="absolute inset-0 block w-full" :class="view === 'slider' && 'invisible'" aria-label="diff image"></canvas>
        <template v-if="view === 'slider'">
          <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" :style="{ left: `${cut}%` }">
            <span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold tracking-widest text-white">◀ ▶</span>
          </div>
          <span class="demo-tag left-2">baseline</span>
          <span class="demo-tag right-2">actual</span>
        </template>
        <span v-else class="demo-tag left-2">diff</span>
      </div>

      <input
        v-if="view === 'slider'"
        v-model.number="cut"
        type="range"
        min="0"
        max="100"
        class="block w-full max-w-xl accent-primary"
        aria-label="Compare baseline and actual"
      />
      <p class="max-w-xl text-xs text-muted">
        Drag across the two renders. The only change is a wider, green "Buy now" button. With 1% of the
        pixels allowed, the comparison fails and leaves these three files for someone to review.
      </p>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        The demo renders in your browser; enable JavaScript to try it.
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.demo-tag {
  position: absolute;
  top: 0.5rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fff;
  border: 1px solid #d4d4d8;
  color: #52525b;
}
</style>
