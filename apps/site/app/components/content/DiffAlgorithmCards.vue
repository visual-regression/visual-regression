<script setup lang="ts">
// Situations and the algorithm that fits each, with the measured fact that
// backs it. `detail` adds the reasoning (the guide); without it the cards are
// compact (the landing page).
import { situations } from '~/lib/diff-guide';

const props = defineProps<{ detail?: boolean; limit?: number | string }>();
const shown = computed(() => (props.limit ? situations.slice(0, Number(props.limit)) : situations));
</script>

<template>
  <ul class="not-prose grid gap-3 sm:grid-cols-2" :class="detail ? '' : 'lg:grid-cols-3'">
    <li
      v-for="s in shown"
      :key="s.id"
      class="flex flex-col rounded-lg border border-default p-4"
    >
      <p class="font-medium text-highlighted">{{ s.question }}</p>
      <p class="mt-2">
        <span class="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium text-emerald-700 dark:text-primary">
          {{ s.pick }}
        </span>
      </p>
      <p v-if="detail" class="mt-2 text-sm text-muted">{{ s.why }}</p>
      <p class="mt-2 text-sm text-muted">{{ s.fact() }}</p>
    </li>
  </ul>
</template>
