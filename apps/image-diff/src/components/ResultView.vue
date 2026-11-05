<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { ViewMode } from '../lib/views';

const props = defineProps<{
  baseline: string;
  actual: string;
  diff: string | null;
  mode: ViewMode;
  /** the three images share this id prefix so the labels are unique */
  id: string;
}>();

const slider = ref(50);
const opacity = ref(0.75);

// blink: the actual image shows for half the time
const showActual = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
const stopBlink = () => {
  clearInterval(timer);
  timer = undefined;
};
watch(
  () => props.mode,
  (mode) => {
    stopBlink();
    if (mode === 'blink') {
      showActual.value = false;
      timer = setInterval(() => (showActual.value = !showActual.value), 600);
    }
  },
  { immediate: true },
);
onBeforeUnmount(stopBlink);
</script>

<template>
  <div v-if="mode === 'side-by-side'" class="grid gap-2 sm:grid-cols-3">
    <figure class="min-w-0">
      <div class="checker overflow-hidden rounded-md border border-border">
        <img :src="baseline" alt="Baseline" class="block w-full" />
      </div>
      <figcaption class="mt-1 text-xs text-muted">Baseline</figcaption>
    </figure>
    <figure class="min-w-0">
      <div class="checker overflow-hidden rounded-md border border-border">
        <img :src="actual" alt="Actual" class="block w-full" />
      </div>
      <figcaption class="mt-1 text-xs text-muted">Actual</figcaption>
    </figure>
    <figure class="min-w-0">
      <div class="checker overflow-hidden rounded-md border border-border">
        <img v-if="diff" :src="diff" alt="Diff" class="block w-full" />
        <div v-else class="p-4 text-center text-xs text-muted">
          No diff image
        </div>
      </div>
      <figcaption class="mt-1 text-xs text-muted">Diff</figcaption>
    </figure>
  </div>

  <div v-else-if="mode === 'slider'" class="space-y-2">
    <div
      class="checker relative overflow-hidden rounded-md border border-border"
    >
      <img :src="baseline" alt="Baseline" class="block w-full" />
      <img
        :src="actual"
        alt="Actual"
        class="absolute inset-0 block w-full"
        :style="{ clipPath: `inset(0 0 0 ${slider}%)` }"
      />
      <div
        class="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
        :style="{ left: `calc(${slider}% - 1px)` }"
        aria-hidden="true"
      ></div>
    </div>
    <label class="flex items-center gap-2 text-xs text-muted">
      <span>Baseline</span>
      <input
        v-model.number="slider"
        type="range"
        min="0"
        max="100"
        class="flex-1"
        :aria-label="`Wipe between baseline and actual (${id})`"
      />
      <span>Actual</span>
    </label>
  </div>

  <div v-else-if="mode === 'blink'" class="space-y-2">
    <div
      class="checker relative overflow-hidden rounded-md border border-border"
    >
      <img :src="baseline" alt="Baseline" class="block w-full" />
      <img
        :src="actual"
        alt="Actual"
        class="absolute inset-0 block w-full transition-opacity duration-100"
        :class="showActual ? 'opacity-100' : 'opacity-0'"
      />
      <span
        class="absolute top-2 left-2 rounded bg-fg/80 px-1.5 py-0.5 font-mono text-xs text-bg"
        aria-live="off"
      >
        {{ showActual ? 'actual' : 'baseline' }}
      </span>
    </div>
    <p class="text-xs text-muted">
      Alternates between the two images; movement is easy to spot.
    </p>
  </div>

  <div v-else class="space-y-2">
    <div
      class="checker relative overflow-hidden rounded-md border border-border"
    >
      <img :src="actual" alt="Actual" class="block w-full" />
      <img
        v-if="diff"
        :src="diff"
        alt="Diff"
        class="absolute inset-0 block w-full mix-blend-multiply"
        :style="{ opacity }"
      />
    </div>
    <label class="flex items-center gap-2 text-xs text-muted">
      <span>Diff opacity</span>
      <input
        v-model.number="opacity"
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="flex-1"
        :aria-label="`Diff opacity over the actual image (${id})`"
      />
      <span class="w-8 text-right font-mono"
        >{{ Math.round(opacity * 100) }}%</span
      >
    </label>
    <p class="text-xs text-muted">
      The diff image multiplied over the actual image.
    </p>
  </div>
</template>
