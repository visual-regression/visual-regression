<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ViewerData, ViewerEntry } from '../src/types';

const props = defineProps<{ data: ViewerData }>();

const tone: Record<string, string> = {
  failed: 'text-vrv-error bg-vrv-error/10',
  'missing-baseline': 'text-vrv-warning bg-vrv-warning/10',
  passed: 'text-vrv-success bg-vrv-success/10',
  created: 'text-vrv-info bg-vrv-info/10',
  updated: 'text-vrv-info bg-vrv-info/10',
  approved: 'text-vrv-info bg-vrv-info/10',
};

const needsHuman = computed(() =>
  props.data.entries.filter((e) => e.needsHuman),
);
const rest = computed(() => props.data.entries.filter((e) => !e.needsHuman));
const groups = computed(() => [
  { title: 'Needs a human', items: needsHuman.value },
  { title: 'Everything else', items: rest.value },
]);
const written = computed(
  () =>
    props.data.counts.created +
    props.data.counts.updated +
    props.data.counts.approved,
);

// the selection lives in the URL hash, so a reload (also the live one) keeps it
const selectedId = ref(location.hash.slice(1));
const current = computed<ViewerEntry | undefined>(
  () =>
    props.data.entries.find((e) => e.id === selectedId.value) ??
    props.data.entries[0],
);
const slider = ref(50);
const select = (entry: ViewerEntry) => {
  selectedId.value = entry.id;
  slider.value = 50;
  history.replaceState(null, '', `#${entry.id}`);
};
const onHash = () => (selectedId.value = location.hash.slice(1));
onMounted(() => addEventListener('hashchange', onHash));
onBeforeUnmount(() => removeEventListener('hashchange', onHash));

const percent = (ratio: number) =>
  ratio === 0
    ? '0%'
    : ratio < 0.0001
      ? '<0.01%'
      : `${(ratio * 100).toFixed(2)}%`;
const badge = (entry: ViewerEntry) =>
  entry.status === 'missing-baseline' ? 'new' : entry.status.slice(0, 4);
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-4 p-4 font-vrv sm:p-6">
    <header class="flex flex-wrap items-center gap-2 text-sm">
      <h1 class="mr-2 text-lg font-semibold">{{ data.title }}</h1>
      <span class="rounded-vrv px-2 py-0.5" :class="tone.failed"
        >{{ data.counts.failed }} failed</span
      >
      <span class="rounded-vrv px-2 py-0.5" :class="tone['missing-baseline']">
        {{ data.counts['missing-baseline'] }} missing baseline
      </span>
      <span class="rounded-vrv px-2 py-0.5" :class="tone.passed"
        >{{ data.counts.passed }} passed</span
      >
      <span class="rounded-vrv px-2 py-0.5" :class="tone.created"
        >{{ written }} baselines written</span
      >
      <span class="text-vrv-muted">
        from {{ data.manifests }} manifest{{ data.manifests === 1 ? '' : 's' }},
        {{ data.tool.name }} {{ data.tool.version ?? '' }} on
        {{ data.runner.name }}
      </span>
    </header>

    <ul
      v-if="data.warnings.length"
      class="space-y-1 rounded-vrv border border-vrv-warning/40 bg-vrv-warning/10 p-3 text-sm text-vrv-warning"
    >
      <li v-for="warning in data.warnings" :key="warning">{{ warning }}</li>
    </ul>

    <p v-if="data.entries.length === 0" class="text-vrv-muted">
      The manifests list no screenshots.
    </p>

    <div v-else class="grid gap-4 lg:grid-cols-[300px_1fr]">
      <nav
        class="max-h-[80vh] overflow-y-auto rounded-vrv border border-vrv-border text-sm"
      >
        <template v-for="group in groups" :key="group.title">
          <div
            v-if="group.items.length"
            class="sticky top-0 bg-vrv-surface px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-vrv-muted"
          >
            {{ group.title }} · {{ group.items.length }}
          </div>
          <button
            v-for="entry in group.items"
            :key="entry.id"
            type="button"
            class="flex w-full items-start gap-2 border-t border-vrv-border px-3 py-2 text-left hover:bg-vrv-surface"
            :class="entry.id === current?.id && 'bg-vrv-accent/10'"
            @click="select(entry)"
          >
            <span
              class="mt-0.5 shrink-0 rounded-vrv px-1.5 text-xs font-medium"
              :class="tone[entry.status]"
            >
              {{ badge(entry) }}
            </span>
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ entry.name }}</span>
              <span class="block truncate text-xs text-vrv-muted">
                {{
                  entry.test.filePath ||
                  entry.test.titlePath.join(' › ') ||
                  entry.source
                }}
                <template v-if="entry.platform">
                  · {{ entry.platform }}</template
                >
              </span>
            </span>
          </button>
        </template>
      </nav>

      <section v-if="current" class="min-w-0 space-y-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-lg font-semibold">{{ current.name }}</h2>
          <span
            class="rounded-vrv px-2 py-0.5 text-sm"
            :class="tone[current.status]"
            >{{ current.status }}</span
          >
          <span class="text-sm text-vrv-muted">
            diff {{ percent(current.comparison.diffRatio) }}
            <template v-if="current.comparison.maxDiffRatio !== undefined">
              · max {{ percent(current.comparison.maxDiffRatio) }}</template
            >
            <template v-if="current.comparison.colorThreshold !== undefined">
              · colour tolerance {{ current.comparison.colorThreshold }} ({{
                current.comparison.colorMetric
              }})
            </template>
            <template v-if="current.viewport">
              · {{ current.viewport.width }}×{{
                current.viewport.height
              }}</template
            >
            <template v-if="current.platform">
              · {{ current.platform }}</template
            >
          </span>
        </div>
        <p
          v-if="current.test.titlePath.length || current.test.filePath"
          class="text-sm text-vrv-muted"
        >
          {{ current.test.titlePath.join(' › ') }}
          <code v-if="current.test.filePath" class="break-all font-vrv-mono">{{
            current.test.filePath
          }}</code>
          <template v-if="current.test.retry > 0">
            · attempt {{ current.test.retry + 1 }}</template
          >
        </p>
        <p v-if="current.message" class="text-sm">{{ current.message }}</p>

        <div
          v-if="current.images.baseline && current.images.actual"
          class="space-y-2"
        >
          <div
            class="relative inline-block max-w-full overflow-hidden rounded-vrv border border-vrv-border bg-[repeating-conic-gradient(#8882_0_25%,transparent_0_50%)] bg-size-[16px_16px]"
          >
            <img
              :src="current.images.baseline"
              alt="Baseline"
              class="block max-w-full"
            />
            <img
              :src="current.images.actual"
              alt="Actual"
              class="absolute inset-0 block max-w-full"
              :style="{ clipPath: `inset(0 0 0 ${slider}%)` }"
            />
            <div
              class="pointer-events-none absolute inset-y-0 w-0.5 bg-vrv-accent"
              :style="{ left: `${slider}%` }"
            />
          </div>
          <div class="flex items-center gap-3 text-xs text-vrv-muted">
            <span>baseline</span>
            <input
              v-model.number="slider"
              type="range"
              min="0"
              max="100"
              class="min-w-0 flex-1 accent-vrv-accent sm:max-w-64"
              aria-label="Compare baseline and actual"
            />
            <span>actual</span>
          </div>
        </div>
        <div v-else class="flex flex-wrap gap-4">
          <figure v-if="current.images.baseline">
            <img
              :src="current.images.baseline"
              alt="Baseline"
              class="max-h-96 max-w-full rounded-vrv border border-vrv-border"
            />
            <figcaption class="mt-1 text-xs text-vrv-muted">
              baseline
            </figcaption>
          </figure>
          <figure v-if="current.images.actual">
            <img
              :src="current.images.actual"
              alt="Actual"
              class="max-h-96 max-w-full rounded-vrv border border-vrv-border"
            />
            <figcaption class="mt-1 text-xs text-vrv-muted">actual</figcaption>
          </figure>
          <p
            v-if="!current.images.baseline && !current.images.actual"
            class="text-sm text-vrv-muted"
          >
            No image files for this entry in the run (<code
              class="break-all font-vrv-mono"
              >{{ current.paths.baseline }}</code
            >).
          </p>
        </div>
        <figure v-if="current.images.diff">
          <img
            :src="current.images.diff"
            alt="Diff"
            class="max-h-96 max-w-full rounded-vrv border border-vrv-border"
          />
          <figcaption class="mt-1 break-all text-xs text-vrv-muted">
            diff · {{ current.paths.diff }}
          </figcaption>
        </figure>
      </section>
    </div>
  </main>
</template>
