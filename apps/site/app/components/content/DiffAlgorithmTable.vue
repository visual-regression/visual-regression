<script setup lang="ts">
// The five algorithms side by side. Speed is measured (median of five runs of
// the tool's worker on a 960×600 page), the rest is what the algorithms do.
import { algorithms } from '~/lib/diff-guide';
import { field } from '~/lib/diff-examples';

const rows = [
  { key: 'measures', label: 'How it measures a difference' },
  { key: 'returns', label: 'What it returns' },
  { key: 'knobs', label: 'Tolerance knobs' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'weaknesses', label: 'Weaknesses' },
  { key: 'use', label: 'Typical use' },
] as const;
</script>

<template>
  <div
    class="not-prose my-6 overflow-x-auto rounded-lg border border-default"
    tabindex="0"
    role="region"
    aria-label="Comparison of the five diff algorithms (scrolls sideways on narrow screens)"
  >
    <table class="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm">
      <thead class="bg-elevated/60 text-xs uppercase tracking-wide text-muted">
        <tr>
          <th scope="col" class="w-32 p-3 font-medium">&nbsp;</th>
          <th v-for="a in algorithms" :key="a.id" scope="col" class="p-3 font-medium">
            <a
              v-if="a.package"
              :href="a.package.url"
              target="_blank"
              rel="noopener"
              class="text-highlighted underline-offset-2 hover:underline"
              >{{ a.name }}</a
            >
            <span v-else class="text-highlighted">{{ a.name }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="border-t border-default align-top">
          <th scope="row" class="p-3 text-xs font-medium text-muted">{{ row.label }}</th>
          <td v-for="a in algorithms" :key="a.id" class="p-3 text-muted">{{ a[row.key] }}</td>
        </tr>
        <tr class="border-t border-default align-top">
          <th scope="row" class="p-3 text-xs font-medium text-muted">
            Speed, 960×600 (measured)
          </th>
          <td v-for="a in algorithms" :key="a.id" class="p-3 font-mono text-highlighted">
            {{ field('typo', a.config, 'ms') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
