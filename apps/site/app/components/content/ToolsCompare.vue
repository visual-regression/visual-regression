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

// `URL` is not exposed to Vue templates, so format source links here
function sourceLabel(source: string) {
  try {
    const { hostname, pathname } = new URL(source);
    return hostname + pathname;
  } catch {
    return source;
  }
}

const rows = computed(() =>
  (tools.value ?? [])
    .filter((t) => category.value === 'all' || t.category === category.value)
    .filter((t) => !onlyManifest.value || t.manifestSupport !== 'none')
    .filter((t) => !onlyOpenSource.value || t.openSource)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

const label = toolLabel;
const manifestColor = (value: string) =>
  value === 'native'
    ? 'primary'
    : value === 'converter'
      ? 'info'
      : value === 'generic'
        ? 'neutral'
        : 'neutral';
const resultsColor = (value: string) =>
  value === 'manifest' || value === 'json-report'
    ? 'primary'
    : value === 'images-only'
      ? 'warning'
      : 'neutral';

const expanded = ref<string | null>(null);
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

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-sm">
        <thead class="bg-elevated text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th class="px-3 py-2">Tool</th>
            <th class="px-3 py-2">Category</th>
            <th class="px-3 py-2">Runs</th>
            <th class="px-3 py-2">Review</th>
            <th class="px-3 py-2">Baselines</th>
            <th class="px-3 py-2">Pricing</th>
            <th class="px-3 py-2">Machine-readable results</th>
            <th class="px-3 py-2">Manifest</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="tool in rows" :key="tool.id">
            <tr
              class="cursor-pointer border-t border-default hover:bg-elevated/50"
              :aria-expanded="expanded === tool.id"
              @click="expanded = expanded === tool.id ? null : tool.id"
            >
              <td class="px-3 py-2 font-medium">
                <a
                  :href="tool.website"
                  target="_blank"
                  rel="noopener"
                  class="hover:underline"
                  @click.stop
                  >{{ tool.name }}</a
                >
                <span v-if="!tool.openSource" class="ml-1 text-xs text-muted"
                  >proprietary</span
                >
              </td>
              <td class="px-3 py-2 text-muted">
                {{ CATEGORIES[tool.category] }}
              </td>
              <td class="px-3 py-2">{{ label('hosting', tool.hosting) }}</td>
              <td class="px-3 py-2">
                {{ tool.reviewSurface.map((s) => label('reviewSurface', s)).join(', ') }}
              </td>
              <td class="px-3 py-2">
                {{ label('baselineStorage', tool.baselineStorage) }}
              </td>
              <td class="px-3 py-2">
                {{ label('pricingModel', tool.pricingModel) }}
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :color="resultsColor(tool.machineReadableResults)"
                  variant="subtle"
                  size="sm"
                  >{{ label('machineReadableResults', tool.machineReadableResults) }}</UBadge
                >
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :color="manifestColor(tool.manifestSupport)"
                  variant="subtle"
                  size="sm"
                  >{{ label('manifestSupport', tool.manifestSupport) }}</UBadge
                >
              </td>
            </tr>
            <tr v-if="expanded === tool.id" class="border-t border-default bg-elevated/30">
              <td colspan="8" class="px-3 py-3">
                <p class="mb-2">{{ tool.summary }}</p>
                <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
                  <dt class="text-muted">Runners</dt>
                  <dd>{{ tool.runners.join(', ') }}</dd>
                  <dt class="text-muted">Diff engine</dt>
                  <dd>{{ tool.diffEngine }}</dd>
                  <dt class="text-muted">License</dt>
                  <dd>{{ tool.license ?? (tool.openSource ? 'open source' : 'proprietary') }}</dd>
                  <dt class="text-muted">Self-hostable</dt>
                  <dd>{{ tool.selfHostable ? 'yes' : 'no' }}</dd>
                  <dt v-if="tool.aliases?.length" class="text-muted">Also known as</dt>
                  <dd v-if="tool.aliases?.length">{{ tool.aliases.join(', ') }}</dd>
                </dl>
                <ul v-if="tool.notes?.length" class="mt-2 list-disc pl-5 text-sm">
                  <li v-for="note in tool.notes" :key="note">{{ note }}</li>
                </ul>
                <p class="mt-2 text-xs text-muted">
                  Verified {{ tool.lastVerified }} against
                  <template v-for="(source, i) in tool.sources" :key="source">
                    <a :href="source" target="_blank" rel="noopener" class="underline">{{
                      sourceLabel(source)
                    }}</a><span v-if="i < tool.sources.length - 1">, </span>
                  </template>.
                  <a
                    :href="`https://github.com/visual-regression/visual-regression/edit/main/apps/site/data/tools/${tool.stem?.split('/').pop()}.yml`"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                    >Correct this entry</a
                  >
                </p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
