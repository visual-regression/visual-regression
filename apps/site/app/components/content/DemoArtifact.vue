<script setup lang="ts">
// Chapter 5: what a run leaves on the runner's disk, and which of those files
// make it into the uploaded artifact. The run itself comes from `utils/demoRun`;
// the artifact size is the sum of the included files. "Open in the viewer"
// navigates to the viewer with a query that regenerates the same run there.
const includeBaselines = ref(true);
const includeManifest = ref(true);
const onlyFailures = ref(false);
const produced = ref<DemoProduced[]>([]);
const results = ref<DemoResult[]>([]);
const ready = ref(false);

onMounted(async () => {
  const run = await generateDemoRun();
  produced.value = run.produced;
  results.value = run.results;
  ready.value = true;
});

const options = computed<DemoOptions>(() => ({
  baselines: includeBaselines.value,
  manifest: includeManifest.value,
  onlyFailures: onlyFailures.value,
}));
const included = (f: DemoProduced) => isInDemoArtifact(f, options.value);
const artifact = computed(() => produced.value.filter(included));
const bytes = computed(() => artifact.value.reduce((n, f) => n + f.blob.size, 0));
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const failed = computed(() => results.value.filter((r) => r.status === 'failed').length);

const can = computed(() => [
  { ok: true, text: `See the actual image of each of the ${failed.value} failures` },
  includeBaselines.value
    ? { ok: true, text: 'Compare each one against the baseline it failed against' }
    : { ok: false, text: 'No baseline in the artifact: check out the commit and dig the baseline out of git' },
  includeManifest.value
    ? { ok: true, text: `Know that ${failed.value} of ${results.value.length} screenshots failed, and by how much, without opening a folder` }
    : { ok: false, text: 'No manifest: walk the folders and match file names by hand to work out what failed' },
  onlyFailures.value
    ? { ok: false, text: 'The passing screenshots stayed on the runner; nobody can double-check them' }
    : { ok: true, text: 'Double-check the passing screenshots too' },
]);

const openInViewer = () => navigateTo({ path: '/viewer', query: demoQuery(options.value) });
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-4">
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <UCheckbox v-model="includeBaselines" label="Include the baselines" />
        <UCheckbox v-model="includeManifest" label="Include the manifest" />
        <UCheckbox v-model="onlyFailures" label="Only the failures' images" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="min-w-0 rounded-lg border border-default">
          <p class="flex flex-wrap items-baseline gap-x-2 border-b border-default bg-elevated px-3 py-2 text-xs">
            <span class="font-medium uppercase tracking-wide text-muted">The artifact</span>
            <span v-if="ready" class="ml-auto font-mono text-muted">{{ artifact.length }} files · {{ kb(bytes) }}</span>
          </p>
          <ul v-if="ready" class="px-3 py-2 font-mono text-xs leading-6">
            <li
              v-for="f in produced"
              :key="f.path"
              class="flex gap-2 wrap-anywhere"
              :class="included(f) ? '' : 'text-dimmed line-through decoration-dimmed'"
            >
              <span class="min-w-0 flex-1">{{ f.path }}</span>
              <span class="shrink-0 text-muted">{{ kb(f.blob.size) }}</span>
            </li>
          </ul>
          <p v-else class="px-3 py-6 text-center text-xs text-muted">Rendering the run…</p>
        </section>

        <section class="min-w-0 rounded-lg border border-default">
          <p class="border-b border-default bg-elevated px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            What a reviewer can do with it
          </p>
          <ul class="space-y-2 px-3 py-3 text-sm">
            <li v-for="c in can" :key="c.text" class="flex gap-2">
              <UIcon :name="c.ok ? 'i-lucide-check' : 'i-lucide-x'" class="mt-0.5 size-4 shrink-0" :class="c.ok ? 'text-success' : 'text-error'" />
              <span>{{ c.text }}</span>
            </li>
          </ul>
          <div class="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2">
            <UButton size="xs" color="primary" :disabled="!ready || !includeManifest" trailing-icon="i-lucide-arrow-right" @click="openInViewer">
              Open in the viewer
            </UButton>
            <span class="text-xs text-muted">
              {{ includeManifest ? 'Opens the viewer with this run loaded.' : 'The viewer needs the manifest to know what to show.' }}
            </span>
          </div>
        </section>
      </div>
      <p class="text-xs text-muted">
        The run is five screenshots of the mock checkout, compared in your browser. Sizes are those of the PNG files it
        produced. Real full-page screenshots tend to be many times larger. That's when the "only the failures' images" option is useful to decrease size of the artifacts.
      </p>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        The demo renders the run in your browser; enable JavaScript to try it.
      </div>
    </template>
  </ClientOnly>
</template>
