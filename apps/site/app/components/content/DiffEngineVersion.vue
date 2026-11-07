<script setup lang="ts">
// The version of an engine (or the browser) the measurements were made with
import { examples } from '~/lib/diff-examples';

const props = defineProps<{ name: string }>();
const text = computed(() =>
  props.name === 'browser' ? examples.browser : (examples.engines[props.name] ?? ''),
);
</script>

<template>
  <span class="font-mono text-[0.92em]">{{ text }}</span>
</template>
