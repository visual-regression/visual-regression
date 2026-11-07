<script setup lang="ts">
// Every example pair against every algorithm, as the engines measured it.
// Shading shows how big the difference is on each engine's own scale, so a
// column reads top to bottom; the engines are not comparable with each other.
import { configById, examples, figure, scale } from '~/lib/diff-examples';

// the guide's judgement of each example, not a measurement
const WORTH_FAILING: Record<string, string> = {
  'subpixel-text': 'no',
  'one-pixel-shift': 'usually not',
  'color-tint': 'yes',
  'jpeg-compression': 'no',
  'added-element': 'yes',
  'size-mismatch': 'yes',
  noise: 'no',
  typo: 'yes',
};

const columns = computed(() => examples.configs.map((c) => configById(c.id)));
const shade = (pair: string, config: string) => {
  const s = scale(pair, config);
  if (s === 0) return 'bg-success/10 text-success';
  if (s < 0.005) return 'bg-warning/5';
  if (s < 0.03) return 'bg-warning/15';
  if (s < 0.1) return 'bg-error/15';
  return 'bg-error/25';
};
</script>

<template>
  <div
    class="not-prose my-6 overflow-x-auto rounded-lg border border-default"
    tabindex="0"
    role="region"
    aria-label="Measured results for every example and algorithm (scrolls sideways on narrow screens)"
  >
    <table class="w-full min-w-[60rem] border-collapse text-left text-sm">
      <thead class="bg-elevated/60 text-xs text-muted">
        <tr>
          <th scope="col" class="sticky left-0 bg-elevated p-2 font-medium">Example</th>
          <th scope="col" class="p-2 font-medium">Worth failing a test?</th>
          <th v-for="c in columns" :key="c.id" scope="col" class="p-2 font-medium">
            {{ c.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in examples.pairs" :key="p.id" class="border-t border-default">
          <th scope="row" class="sticky left-0 bg-default p-2 font-medium text-highlighted">
            <a :href="`#${p.id}`" class="underline-offset-2 hover:underline">{{ p.title }}</a>
          </th>
          <td class="p-2" :class="WORTH_FAILING[p.id] === 'yes' ? 'text-error' : 'text-muted'">
            {{ WORTH_FAILING[p.id] }}
          </td>
          <td
            v-for="c in columns"
            :key="c.id"
            class="p-2 font-mono tabular-nums"
            :class="shade(p.id, c.id)"
          >
            {{ figure(p.id, c.id) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
