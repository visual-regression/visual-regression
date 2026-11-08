<script setup lang="ts">
// One measured example: the two images, what each default engine made of them
// (its headline figure and the diff image it drew), and a link that opens
// the pair in the image diff tool.
import { algorithms } from '~/lib/diff-guide';
import { field, figure, pairById, pixelSize, toolHref } from '~/lib/diff-examples';

const props = defineProps<{ pair: string }>();
const p = computed(() => pairById(props.pair));
const engines = algorithms.map((a) => ({ id: a.id, name: a.name }));
</script>

<template>
  <div :id="pair" class="not-prose my-4 space-y-3">
    <p class="text-sm text-muted">{{ p.changed }}</p>
    <div class="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-1">
        <figure class="min-w-0">
          <img :src="p.baseline" :alt="`Baseline of the example: ${p.title}`" loading="lazy" class="w-full rounded border border-default" />
          <figcaption class="mt-1 font-mono text-xs text-muted">baseline {{ pixelSize(p.baselineSize) }}</figcaption>
        </figure>
        <figure class="min-w-0">
          <img :src="p.actual" :alt="`Actual image of the example: ${p.title}`" loading="lazy" class="w-full rounded border border-default" />
          <figcaption class="mt-1 font-mono text-xs text-muted">actual {{ pixelSize(p.actualSize) }}</figcaption>
        </figure>
      </div>
      <ul class="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <li v-for="e in engines" :key="e.id" class="min-w-0 rounded-lg border border-default p-2">
          <img
            v-if="p.results[e.id]?.diff"
            :src="p.results[e.id]!.diff"
            :alt="`Diff drawn by ${e.name}`"
            loading="lazy"
            class="w-full rounded border border-default"
          />
          <p class="mt-1.5 text-xs text-muted">{{ e.name }}</p>
          <p class="font-mono text-sm font-semibold text-highlighted">{{ figure(pair, e.id) }}</p>
          <p v-if="p.results[e.id]?.unit === 'pixels'" class="font-mono text-xs text-muted">
            {{ field(pair, e.id, 'px') }} px
          </p>
        </li>
      </ul>
    </div>
    <p class="text-sm">
      <NuxtLink :to="toolHref(p)" class="font-medium text-emerald-700 underline underline-offset-2 dark:text-primary">
        Open this pair in the image diff tool
      </NuxtLink>
    </p>
  </div>
</template>
