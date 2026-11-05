<script setup lang="ts">
import { ref } from 'vue';
import { size } from '../lib/format';
import type { Dimensions } from '../types';

const props = defineProps<{
  label: string;
  url: string | null;
  name: string;
  dims: Dimensions | null;
}>();
const emit = defineEmits<{ files: [files: File[]]; clear: [] }>();

const input = ref<HTMLInputElement | null>(null);
const over = ref(false);

const onDrop = (event: DragEvent) => {
  over.value = false;
  const files = [...(event.dataTransfer?.files ?? [])].filter((f) =>
    f.type.startsWith('image/'),
  );
  if (files.length) emit('files', files);
};
const onPick = () => {
  const files = [...(input.value?.files ?? [])];
  if (files.length) emit('files', files);
  if (input.value) input.value.value = '';
};
const id = `drop-${props.label.toLowerCase()}`;
</script>

<template>
  <div
    class="group relative flex min-h-56 flex-col rounded-lg border-2 border-dashed transition-colors"
    :class="
      over
        ? 'border-accent bg-accent/5'
        : url
          ? 'border-border bg-surface'
          : 'border-border bg-sunken'
    "
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <div class="flex items-center gap-2 px-3 pt-2 text-sm">
      <span class="font-medium">{{ label }}</span>
      <span v-if="dims" class="font-mono text-xs text-muted">
        {{ size(dims) }}
      </span>
      <span v-if="name" class="truncate text-xs text-muted" :title="name">
        {{ name }}
      </span>
      <button
        v-if="url"
        type="button"
        class="ml-auto text-xs text-muted hover:text-fg"
        @click="emit('clear')"
      >
        Clear
      </button>
    </div>

    <label
      :for="id"
      class="checker m-2 flex flex-1 cursor-pointer items-center justify-center overflow-hidden rounded-md"
    >
      <img
        v-if="url"
        :src="url"
        :alt="`${label} image`"
        class="max-h-72 max-w-full object-contain"
      />
      <span
        v-else
        class="flex flex-col items-center gap-1 p-6 text-center text-sm text-muted"
      >
        <span class="text-base text-fg"
          >Drop the {{ label.toLowerCase() }} image here</span
        >
        <span>or click to choose a file, or paste it</span>
      </span>
    </label>
    <input
      :id="id"
      ref="input"
      type="file"
      accept="image/*"
      multiple
      class="sr-only"
      @change="onPick"
    />
  </div>
</template>
