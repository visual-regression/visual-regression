<script setup lang="ts">
const CATEGORIES = TOOL_CATEGORIES;

const { data: tools } = await useAsyncData('tools', () =>
  queryCollection('tools').all(),
);

// `/compare?category=mobile-native&manifest=1` preselects the filters (the learn track links this way)
const query = useRoute().query;
const fromQuery = String(query.category ?? '');
const category = ref<keyof typeof CATEGORIES | 'all'>(fromQuery in CATEGORIES ? (fromQuery as keyof typeof CATEGORIES) : 'all');
const onlyManifest = ref(query.manifest === '1');
const onlyOpenSource = ref(false);

const rows = computed(() =>
  (tools.value ?? [])
    .filter((t) => category.value === 'all' || t.category === category.value)
    .filter((t) => !onlyManifest.value || t.manifestSupport !== 'none')
    .filter((t) => !onlyOpenSource.value || t.openSource)
    .sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<template>
  <div class="not-prose my-6 space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="category"
        :items="[
          { label: 'Every category', value: 'all' },
          ...Object.entries(CATEGORIES).map(([value, label]) => ({
            label,
            value,
          })),
        ]"
        class="w-56"
        aria-label="Category"
      />
      <UCheckbox v-model="onlyManifest" label="Can produce a manifest" />
      <UCheckbox v-model="onlyOpenSource" label="Open source" />
      <span class="ml-auto text-sm text-muted">
        {{ rows.length }} of {{ tools?.length ?? 0 }} tools
      </span>
    </div>

    <div class="rounded-lg border border-default">
      <ToolList :tools="rows" />
      <p v-if="!rows.length" class="px-3 py-6 text-center text-sm text-muted">No tool matches these filters.</p>
    </div>
  </div>
</template>
