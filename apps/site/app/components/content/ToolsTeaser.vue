<script setup lang="ts">
// Three rows of the comparison on the landing page: a local runner, a hosted
// service and a self-contained tool, read from the same data as /compare.
const PICK = ['Playwright toHaveScreenshot', 'Percy', 'BackstopJS'];
const { data: tools } = await useAsyncData('tools-teaser', () =>
  queryCollection('tools').where('name', 'IN', PICK).all(),
);
const { data: total } = await useAsyncData('tools-count', () =>
  queryCollection('tools').count(),
);
const rows = computed(() =>
  PICK.map((n) => tools.value?.find((t) => t.name === n)).filter(
    (t) => t !== undefined,
  ),
);
const COLUMNS = [
  { key: 'category', label: 'Kind' },
  { key: 'pricingModel', label: 'Pricing' },
  { key: 'baselineStorage', label: 'Baselines' },
  { key: 'manifestSupport', label: 'Manifest' },
] as const;
const KIND: Record<string, string> = {
  'runner-integration': 'runner',
  'hosted-review': 'hosted review',
  'mobile-native': 'mobile',
};
const cell = (key: (typeof COLUMNS)[number]['key'], value: string) =>
  key === 'category' ? (KIND[value] ?? value) : toolLabel(key, value);
const tone = (key: string, value: string) =>
  key === 'manifestSupport' && value !== 'none' ? 'text-primary' : 'text-muted';
</script>

<template>
  <div class="not-prose mx-auto max-w-2xl">
    <!-- phones: one card per tool -->
    <ul class="grid gap-3 sm:hidden">
      <li
        v-for="t in rows"
        :key="t.name"
        class="rounded-lg border border-default p-3 text-sm"
      >
        <p class="font-medium text-highlighted">{{ t.name }}</p>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <template v-for="c in COLUMNS" :key="c.key">
            <dt class="text-xs uppercase tracking-wide text-muted">
              {{ c.label }}
            </dt>
            <dd :class="tone(c.key, t[c.key])">{{ cell(c.key, t[c.key]) }}</dd>
          </template>
        </dl>
      </li>
    </ul>
    <!-- wider: the same as a table -->
    <table class="hidden w-full text-sm sm:table">
      <thead class="text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="py-2 pr-3 font-medium">Tool</th>
          <th v-for="c in COLUMNS" :key="c.key" class="py-2 pr-3 font-medium">
            {{ c.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in rows" :key="t.name" class="border-t border-default">
          <td class="py-2 pr-3 font-medium text-highlighted">{{ t.name }}</td>
          <td
            v-for="c in COLUMNS"
            :key="c.key"
            class="py-2 pr-3"
            :class="tone(c.key, t[c.key])"
          >
            {{ cell(c.key, t[c.key]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div class="mt-5 text-center">
      <UButton
        to="/compare"
        color="neutral"
        variant="outline"
        size="lg"
        trailing-icon="i-lucide-arrow-right"
      >
        See all {{ total ?? 31 }} tools
      </UButton>
    </div>
  </div>
</template>
