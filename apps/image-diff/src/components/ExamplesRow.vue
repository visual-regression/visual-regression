<script setup lang="ts">
import type { Example } from '../lib/examples';

defineProps<{
  examples: Example[];
  current: string | null;
  engineName: (id: string) => string;
}>();
const emit = defineEmits<{ pick: [id: string] }>();
</script>

<template>
  <section aria-labelledby="examples-title" class="space-y-3">
    <div class="flex flex-wrap items-baseline gap-x-3">
      <h2 id="examples-title" class="text-sm font-semibold">Load an example</h2>
      <span class="text-xs text-muted">
        Screenshots of a fictional product, each pair with one kind of change.
      </span>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="example in examples"
        :key="example.id"
        type="button"
        class="btn"
        :class="example.id === current && 'btn-primary'"
        :aria-pressed="example.id === current"
        @click="emit('pick', example.id)"
      >
        {{ example.name }}
      </button>
    </div>
    <template v-for="example in examples" :key="example.id">
      <div
        v-if="example.id === current"
        class="rounded-md border border-border bg-surface px-4 py-3 text-sm"
      >
        <p>{{ example.description }}</p>
        <p class="mt-1 text-muted">
          <span class="font-medium text-fg">Look for:</span>
          {{ example.lookFor }}
          <span class="font-medium text-fg"> · Best engine:</span>
          {{ engineName(example.engine) }}
        </p>
      </div>
    </template>
  </section>
</template>
