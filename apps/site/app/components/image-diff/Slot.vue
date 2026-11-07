<script setup lang="ts">
import { size } from '~/lib/image-diff/format';
import type { Dimensions } from '~/lib/image-diff/types';

defineProps<{
  label: string;
  url: string | null;
  name: string;
  dims: Dimensions | null;
}>();
const emit = defineEmits<{ files: [files: File[]]; clear: [] }>();

const input = ref<HTMLInputElement | null>(null);
const onPick = () => {
  const files = [...(input.value?.files ?? [])];
  if (files.length) emit('files', files);
  if (input.value) input.value.value = '';
};
</script>

<template>
  <div class="min-w-0">
    <!-- empty: a drop target; filled: a thin bar above the viewer. The input
         sits inside its label (visually hidden) and the label shows the focus. -->
    <label
      v-if="!url"
      class="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-default px-3 text-center text-sm text-muted transition hover:border-primary hover:bg-primary/5 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
    >
      <input
        ref="input"
        type="file"
        accept="image/*"
        multiple
        class="sr-only"
        :aria-label="`Choose the ${label.toLowerCase()} image`"
        @change="onPick"
      />
      <UIcon name="i-lucide-image-plus" class="size-5" />
      <span class="font-medium text-default">{{ label }}</span>
      <span class="text-xs">drop, paste or choose an image</span>
    </label>
    <div
      v-else
      class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
    >
      <span class="font-medium text-default">{{ label }}</span>
      <span v-if="dims" class="shrink-0 font-mono text-muted">{{
        size(dims)
      }}</span>
      <span class="min-w-0 flex-1 truncate text-muted" :title="name">{{
        name
      }}</span>
      <label
        class="cursor-pointer rounded text-muted underline underline-offset-2 hover:text-highlighted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
      >
        <input
          ref="input"
          type="file"
          accept="image/*"
          multiple
          class="sr-only"
          :aria-label="`Replace the ${label.toLowerCase()} image`"
          @change="onPick"
        />
        Replace
      </label>
      <button
        type="button"
        class="text-muted underline underline-offset-2 hover:text-highlighted"
        @click="emit('clear')"
      >
        Clear
      </button>
    </div>
  </div>
</template>
