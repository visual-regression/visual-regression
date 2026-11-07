<script setup lang="ts">
// A number from the measurements (data/diff-examples.json) inside a sentence,
// so prose and table cannot disagree: `:diff-value{pair="typo" config="exact"}`.
import { field } from '~/lib/diff-examples';

const props = defineProps<{
  pair: string;
  config: string;
  /** `value` (default), `ms`, `px` */
  show?: string;
}>();
const text = computed(() => field(props.pair, props.config, props.show ?? 'value'));
</script>

<template>
  <span class="font-mono text-[0.92em] font-medium">{{ text }}</span>
</template>
