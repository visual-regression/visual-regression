<script setup lang="ts">
import type { OptionDef } from '~/lib/image-diff/types';

const props = defineProps<{ option: OptionDef; id: string }>();
const model = defineModel<number | boolean | string>({ required: true });
const hintId = computed(() => `${props.id}-hint`);
</script>

<template>
  <div class="text-sm">
    <label
      v-if="option.type === 'boolean'"
      :for="id"
      class="flex items-center gap-2"
    >
      <input
        :id="id"
        v-model="model"
        type="checkbox"
        class="accent-primary"
        :aria-describedby="option.hint ? hintId : undefined"
      />
      <span class="font-mono text-xs">{{ option.label }}</span>
    </label>

    <template v-else>
      <label :for="id" class="mb-1 flex justify-between font-mono text-xs">
        <span>{{ option.label }}</span>
        <span v-if="option.type === 'number'" class="text-muted">{{
          model
        }}</span>
      </label>
      <input
        v-if="option.type === 'number'"
        :id="id"
        v-model.number="model"
        type="range"
        :min="option.min"
        :max="option.max"
        :step="option.step"
        class="w-full accent-primary"
        :aria-describedby="option.hint ? hintId : undefined"
      />
      <select
        v-else-if="option.type === 'select'"
        :id="id"
        v-model="model"
        class="w-full rounded border border-default bg-default px-2 py-1 text-xs"
        :aria-describedby="option.hint ? hintId : undefined"
      >
        <option
          v-for="choice in option.choices"
          :key="choice.value"
          :value="choice.value"
        >
          {{ choice.label }}
        </option>
      </select>
      <input
        v-else
        :id="id"
        v-model="model"
        type="color"
        class="h-7 w-14 cursor-pointer rounded border border-default bg-default"
      />
    </template>
    <p v-if="option.hint" :id="hintId" class="mt-1 text-xs text-muted">
      {{ option.hint }}
    </p>
  </div>
</template>
