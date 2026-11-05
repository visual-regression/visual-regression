<script setup lang="ts">
import type { ViewMode } from '../lib/views';
import { viewModes } from '../lib/views';

const model = defineModel<ViewMode>({ required: true });
</script>

<template>
  <div
    role="group"
    aria-label="View"
    class="inline-flex overflow-hidden rounded-md border border-border bg-surface text-sm"
  >
    <button
      v-for="mode in viewModes"
      :key="mode.id"
      type="button"
      class="px-3 py-1.5 font-medium transition-colors not-first:border-l not-first:border-border"
      :class="
        model === mode.id
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:bg-sunken hover:text-fg'
      "
      :aria-pressed="model === mode.id"
      @click="model = mode.id"
    >
      {{ mode.label }}
    </button>
  </div>
</template>
