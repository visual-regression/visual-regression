<script setup lang="ts">
import type { ViewMode } from '~/lib/image-diff/views';

const props = defineProps<{
  baseline: string;
  actual: string;
  diff: string | null;
  /** the legend of the engine whose diff is shown */
  legend?: string;
  width: number;
  height: number;
  mode: ViewMode;
}>();

// slider: the actual image is revealed from the right
const reveal = ref(50);
const opacity = ref(1);
const overlay = ref(false);

// blink: alternates by itself unless the reader prefers reduced motion; the
// button pauses it and then flips between the two images by hand
const playing = ref(true);
const showActual = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
const stop = () => {
  clearInterval(timer);
  timer = undefined;
};
const start = () => {
  stop();
  timer = setInterval(() => (showActual.value = !showActual.value), 700);
};
onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    playing.value = false;
  }
});
watch(
  [() => props.mode, playing],
  () => {
    if (props.mode === 'blink' && playing.value) start();
    else stop();
  },
  { immediate: true },
);
onBeforeUnmount(stop);

// a tall full-page screenshot stays inside the viewport; width follows the ratio
const frame = computed(() => {
  const ratio = props.width / props.height;
  return {
    aspectRatio: `${props.width} / ${props.height}`,
    maxWidth: `min(100%, calc(70vh * ${ratio}))`,
  };
});
const image = 'absolute inset-0 size-full select-none object-fill';
</script>

<template>
  <div class="space-y-2">
    <div v-if="mode === 'side-by-side'" class="grid gap-2 sm:grid-cols-3">
      <figure
        v-for="(item, i) in [
          { src: baseline, label: 'Baseline' },
          { src: actual, label: 'Actual' },
          { src: diff, label: 'Diff' },
        ]"
        :key="i"
        class="min-w-0"
      >
        <div class="checker overflow-hidden rounded border border-default">
          <img
            v-if="item.src"
            :src="item.src"
            :alt="item.label"
            class="block h-auto w-full"
          />
          <p v-else class="p-4 text-center text-xs text-muted">No diff image</p>
        </div>
        <figcaption class="mt-1 text-xs text-muted">
          {{ item.label }}
        </figcaption>
      </figure>
    </div>

    <template v-else>
      <div
        class="checker relative mx-auto w-full overflow-hidden rounded border border-default"
        :style="frame"
      >
        <template v-if="mode === 'slider'">
          <img :src="baseline" alt="Baseline" :class="image" />
          <img
            :src="actual"
            alt="Actual"
            :class="image"
            :style="{ clipPath: `inset(0 0 0 ${reveal}%)` }"
          />
          <div
            class="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
            :style="{ left: `calc(${reveal}% - 1px)` }"
            aria-hidden="true"
          />
        </template>
        <template v-else-if="mode === 'blink'">
          <img :src="baseline" alt="Baseline" :class="image" />
          <img
            :src="actual"
            alt="Actual"
            :class="[image, showActual ? 'opacity-100' : 'opacity-0']"
          />
          <span
            class="absolute left-2 top-2 rounded bg-inverted/80 px-1.5 py-0.5 font-mono text-xs text-inverted"
          >
            {{ showActual ? 'actual' : 'baseline' }}
          </span>
        </template>
        <template v-else>
          <img v-if="overlay" :src="actual" alt="Actual" :class="image" />
          <img
            v-if="diff"
            :src="diff"
            alt="Diff"
            :class="[image, overlay ? 'mix-blend-multiply' : '']"
            :style="{ opacity: overlay ? opacity : 1 }"
          />
          <p
            v-else
            class="absolute inset-0 grid place-items-center text-xs text-muted"
          >
            This engine drew no diff image
          </p>
        </template>
      </div>

      <div
        v-if="mode === 'slider'"
        class="flex items-center gap-2 text-xs text-muted"
      >
        <span>Baseline</span>
        <input
          v-model.number="reveal"
          type="range"
          min="0"
          max="100"
          class="min-w-0 flex-1 accent-primary"
          aria-label="Reveal the actual image from the right: 0 shows only the actual, 100 only the baseline"
        />
        <span>Actual</span>
      </div>
      <div
        v-else-if="mode === 'blink'"
        class="flex flex-wrap items-center gap-2 text-xs text-muted"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
          @click="playing = !playing"
        >
          {{ playing ? 'Pause' : 'Play' }}
        </UButton>
        <UButton
          v-if="!playing"
          size="xs"
          color="neutral"
          variant="subtle"
          icon="i-lucide-arrow-left-right"
          @click="showActual = !showActual"
        >
          Show {{ showActual ? 'baseline' : 'actual' }}
        </UButton>
        <span v-if="!playing">Paused: flip by hand.</span>
        <span v-else>Alternates every 0.7 s.</span>
      </div>
      <div
        v-else
        class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"
      >
        <label class="flex items-center gap-1.5">
          <input v-model="overlay" type="checkbox" class="accent-primary" />
          Over the actual image
        </label>
        <label v-if="overlay" class="flex flex-1 items-center gap-2">
          Diff opacity
          <input
            v-model.number="opacity"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            class="min-w-0 flex-1 accent-primary"
          />
        </label>
        <span v-if="legend" class="basis-full">{{ legend }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checker {
  background-color: #fff;
  background-image:
    linear-gradient(
      45deg,
      #e5e7eb 25%,
      transparent 25%,
      transparent 75%,
      #e5e7eb 75%
    ),
    linear-gradient(
      45deg,
      #e5e7eb 25%,
      transparent 25%,
      transparent 75%,
      #e5e7eb 75%
    );
  background-size: 12px 12px;
  background-position:
    0 0,
    6px 6px;
}
</style>
