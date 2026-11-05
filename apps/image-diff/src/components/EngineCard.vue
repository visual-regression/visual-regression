<script setup lang="ts">
import { computed } from 'vue';
import { integer, millis, percent } from '../lib/format';
import type { ViewMode } from '../lib/views';
import type { EngineInfo, EngineResult, Options } from '../types';
import OptionField from './OptionField.vue';
import ResultView from './ResultView.vue';

export type Status = 'idle' | 'queued' | 'running' | 'done' | 'error';

const props = defineProps<{
  info: EngineInfo;
  status: Status;
  result: EngineResult | null;
  diffUrl: string | null;
  error: string | null;
  baseline: string | null;
  actual: string | null;
  mode: ViewMode;
}>();
const options = defineModel<Options>('options', { required: true });
const emit = defineEmits<{ reset: [] }>();

const ratio = computed(() =>
  props.result ? props.result.mismatch / props.result.total : 0,
);
const primary = computed(() => props.result?.metrics.find((m) => m.primary));
const secondary = computed(() =>
  (props.result?.metrics ?? []).filter((m) => !m.primary),
);
const tone = computed(() => {
  if (!props.result) return '';
  if (props.result.mismatch === 0) return 'text-accent';
  return ratio.value < 0.01 ? 'text-warning' : 'text-error';
});
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    :aria-labelledby="`engine-${info.id}-title`"
  >
    <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 :id="`engine-${info.id}-title`" class="text-base font-semibold">
        {{ info.name }}
      </h3>
      <a
        v-if="info.package"
        :href="info.package.url"
        target="_blank"
        rel="noopener"
        class="font-mono text-xs text-muted underline-offset-2 hover:underline"
        >{{ info.package.name }}@{{ info.package.version }}</a
      >
      <span v-else class="font-mono text-xs text-muted">built in</span>
      <span class="ml-auto text-xs text-muted" aria-live="polite">
        <template v-if="status === 'queued'">queued</template>
        <template v-else-if="status === 'running'">
          <span
            class="inline-block size-2 animate-pulse rounded-full bg-accent"
          ></span>
          running…
        </template>
        <template v-else-if="status === 'done' && result">
          {{ millis(result.elapsedMs) }}
        </template>
      </span>
    </header>

    <p
      v-if="status === 'error'"
      class="rounded-md bg-error/10 px-3 py-2 text-sm text-error"
    >
      {{ error }}
    </p>

    <div v-if="result" class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span class="text-2xl font-semibold tabular-nums" :class="tone">
        {{ primary ? primary.value : percent(ratio) }}
      </span>
      <span class="text-sm text-muted">
        <template v-if="primary">{{ primary.label }} · </template>
        {{ integer(result.mismatch) }} of {{ integer(result.total) }}
        {{ result.unit }} differ
        <template v-if="primary"> ({{ percent(ratio) }})</template>
      </span>
    </div>
    <dl
      v-if="secondary.length"
      class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"
    >
      <template v-for="metric in secondary" :key="metric.label">
        <dt class="font-mono text-muted">{{ metric.label }}</dt>
        <dd class="truncate font-mono" :title="metric.value">
          {{ metric.value }}
        </dd>
      </template>
    </dl>

    <ResultView
      v-if="baseline && actual && result"
      :id="info.id"
      :baseline="baseline"
      :actual="actual"
      :diff="diffUrl"
      :mode="mode"
    />
    <div
      v-else-if="!result && status !== 'error'"
      class="checker flex min-h-40 items-center justify-center rounded-md border border-border text-sm text-muted"
    >
      {{ status === 'idle' ? 'Waiting for two images' : 'Comparing…' }}
    </div>

    <p v-if="result?.legend" class="text-xs text-muted">{{ result.legend }}</p>
    <ul v-if="result?.notes.length" class="space-y-0.5 text-xs text-warning">
      <li v-for="note in result.notes" :key="note">{{ note }}</li>
    </ul>

    <details class="mt-auto rounded-md border border-border bg-sunken">
      <summary class="cursor-pointer px-3 py-2 text-sm font-medium select-none">
        Settings
        <span v-if="!info.options.length" class="font-normal text-muted"
          >(none)</span
        >
      </summary>
      <div class="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
        <OptionField
          v-for="option in info.options"
          :id="`${info.id}-${option.key}`"
          :key="option.key"
          v-model="options[option.key]"
          :option="option"
        />
        <div class="sm:col-span-2">
          <button type="button" class="btn" @click="emit('reset')">
            Reset to defaults
          </button>
        </div>
      </div>
    </details>
  </section>
</template>
