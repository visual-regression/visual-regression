<script setup lang="ts">
import { headline, millis } from '~/lib/image-diff/format';
import type { EngineInfo, EngineResult, Options } from '~/lib/image-diff/types';

export type Status = 'idle' | 'queued' | 'running' | 'done' | 'error';

const props = defineProps<{
  info: EngineInfo;
  status: Status;
  result: EngineResult | null;
  diffUrl: string | null;
  error: string | null;
  selected: boolean;
}>();
const emit = defineEmits<{ select: []; reset: [] }>();
const enabled = defineModel<boolean>('enabled', { required: true });
const options = defineModel<Options>('options', { required: true });

const open = ref(false);
const figures = computed(() =>
  props.result ? headline(props.result, options.value) : null,
);
const panelId = `engine-${props.info.id}-panel`;
const setOption = (key: string, value: number | boolean | string) => {
  options.value = { ...options.value, [key]: value };
};
</script>

<template>
  <li :class="selected ? 'bg-primary/5' : ''">
    <div
      class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_4rem] items-center gap-x-3 px-3 py-2"
    >
      <input
        v-model="enabled"
        type="checkbox"
        class="accent-primary"
        :aria-label="`Run ${info.name}`"
      />

      <div class="min-w-0">
        <button
          type="button"
          class="block max-w-full text-left text-sm font-medium text-highlighted hover:text-primary"
          :aria-pressed="selected"
          :title="`Show the diff of ${info.name} in the viewer`"
          :disabled="!result"
          @click="emit('select')"
        >
          {{ info.name }}
        </button>
        <p class="break-words font-mono text-xs text-muted">
          <template v-if="!enabled">off</template>
          <template v-else-if="status === 'error'">failed</template>
          <template v-else-if="figures">{{ figures.detail }}</template>
          <template v-else-if="status === 'running' || status === 'queued'">
            <UIcon
              name="i-lucide-loader-circle"
              class="size-3 animate-spin align-[-1px] motion-reduce:animate-none"
            />
            {{ status === 'running' ? 'running' : 'waiting' }}
          </template>
          <template v-else>&nbsp;</template>
        </p>
      </div>

      <div class="text-right">
        <template v-if="figures">
          <p class="font-mono text-base font-semibold text-highlighted">
            {{ figures.value }}
          </p>
          <p class="font-mono text-[11px] leading-tight text-muted">
            {{ figures.label }}
          </p>
        </template>
      </div>

      <button
        type="button"
        class="checker block h-10 w-16 overflow-hidden rounded border border-default disabled:opacity-40"
        :disabled="!diffUrl"
        :aria-label="`Show the diff of ${info.name} in the viewer`"
        @click="emit('select')"
      >
        <img
          v-if="diffUrl"
          :src="diffUrl"
          alt=""
          class="size-full object-contain"
        />
      </button>

      <div class="col-span-4 col-start-2 mt-1 flex items-center gap-3 text-xs">
        <button
          type="button"
          class="inline-flex items-center gap-1 text-muted hover:text-highlighted"
          :aria-expanded="open"
          :aria-controls="panelId"
          @click="open = !open"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 transition-transform motion-reduce:transition-none"
            :class="open ? 'rotate-90' : ''"
          />
          Options
        </button>
        <span v-if="result" class="font-mono text-muted">{{
          millis(result.elapsedMs)
        }}</span>
      </div>
    </div>

    <div v-if="error" class="px-3 pb-2 text-xs text-error" role="alert">
      {{ error }}
    </div>

    <div
      v-if="open"
      :id="panelId"
      class="space-y-3 border-t border-default bg-elevated/40 px-3 py-3 text-xs"
    >
      <p class="text-muted">
        {{ info.summary }}
        <a
          v-if="info.package"
          :href="info.package.url"
          target="_blank"
          rel="noopener"
          class="font-mono underline underline-offset-2"
          >{{ info.package.name }}@{{ info.package.version }}</a
        >
      </p>
      <p class="text-muted">
        <span class="font-medium text-default">Different sizes:</span>
        {{ info.sizeMismatch }}
      </p>
      <ul v-if="result?.notes.length" class="list-inside list-disc text-muted">
        <li v-for="note in result.notes" :key="note">{{ note }}</li>
      </ul>
      <dl
        v-if="result && result.metrics.length > 1"
        class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono"
      >
        <template v-for="metric in result.metrics" :key="metric.label">
          <dt class="text-muted">{{ metric.label }}</dt>
          <dd class="break-all">{{ metric.value }}</dd>
        </template>
      </dl>
      <div class="grid gap-3 sm:grid-cols-2">
        <ImageDiffOptionField
          v-for="option in info.options"
          :id="`engine-${info.id}-${option.key}`"
          :key="option.key"
          :option="option"
          :model-value="options[option.key]"
          @update:model-value="(value) => setOption(option.key, value)"
        />
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="subtle"
        icon="i-lucide-rotate-ccw"
        @click="emit('reset')"
      >
        Reset to defaults
      </UButton>
    </div>
  </li>
</template>

<style scoped>
.checker {
  background-color: #fff;
}
</style>
