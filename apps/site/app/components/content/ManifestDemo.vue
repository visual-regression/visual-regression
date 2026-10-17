<script setup lang="ts">
// One manifest, any tool: the producing tool changes, the file does not.
// Paths follow each tool's real layout (see /manifest/converting).
interface Tab {
  label: string;
  how: string;
  commands: string[];
  tool: { name: string; version: string };
  runner: { name: string; version: string };
  images: { baseline: string; actual: string; diff: string };
}
const TABS: Tab[] = [
  {
    label: 'Cypress + pixsame',
    how: 'written by the plugin during the run',
    commands: ['npx cypress run'],
    tool: { name: '@pixsame/cypress-plugin-visual-regression-diff', version: '4.3.0' },
    runner: { name: 'cypress', version: '16.1.0' },
    images: {
      baseline: 'cypress/e2e/__image_snapshots__/checkout summary_#0.png',
      actual: 'cypress/e2e/__image_snapshots__/checkout summary_#0.actual.png',
      diff: 'cypress/e2e/__image_snapshots__/checkout summary_#0.diff.png',
    },
  },
  {
    label: 'Playwright',
    how: 'converted from the JSON report with fromPlaywrightReport',
    commands: ['npx playwright test --reporter=json > report.json', 'node convert.mjs'],
    tool: { name: 'visual-regression-manifest', version: '1.0.0-beta.1' },
    runner: { name: 'playwright', version: '1.58.0' },
    images: {
      baseline: 'tests/checkout.spec.ts-snapshots/checkout-summary-chromium-linux.png',
      actual: 'test-results/checkout-summary-chromium/checkout-summary-actual.png',
      diff: 'test-results/checkout-summary-chromium/checkout-summary-diff.png',
    },
  },
  {
    label: 'Vitest',
    how: 'converted from the screenshot folders with fromVitestScreenshots',
    commands: ['npx vitest run --browser', 'node convert.mjs'],
    tool: { name: 'visual-regression-manifest', version: '1.0.0-beta.1' },
    runner: { name: 'vitest', version: '4.1.2' },
    images: {
      baseline: 'src/__screenshots__/checkout.test.ts/checkout-summary-chromium-linux.png',
      actual: '.vitest/attachments/checkout.test.ts/checkout-summary-chromium-linux-actual.png',
      diff: '.vitest/attachments/checkout.test.ts/checkout-summary-chromium-linux-diff.png',
    },
  },
];
const active = ref(0);
const tab = computed(() => TABS[active.value]!);
</script>

<template>
  <div class="not-prose my-6 space-y-3">
    <div class="flex flex-wrap gap-1 border-b border-default" role="tablist" aria-label="Producing tool">
      <button
        v-for="(t, i) in TABS"
        :key="t.label"
        type="button"
        role="tab"
        :aria-selected="i === active"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
        :class="i === active ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:text-default'"
        @click="active = i"
      >
        {{ t.label }}
      </button>
    </div>
    <p class="text-xs text-muted">{{ tab.how }}</p>

    <div class="grid gap-3">
      <pre class="overflow-x-auto rounded-lg bg-zinc-900 p-4 font-mono text-xs leading-relaxed text-zinc-100"><template v-for="c in tab.commands" :key="c"><span class="text-zinc-500">$</span> {{ c }}
</template><span class="text-emerald-400">✓</span> 42 screenshots compared, 2 failed
<span class="text-emerald-400">✎</span> visual-regression-manifest.json written<span class="caret"></span></pre>

      <pre class="overflow-x-auto rounded-lg border border-default bg-elevated p-4 font-mono text-xs leading-relaxed">{
  <span class="text-primary">"reportFormat"</span>: "visual-regression-manifest",
  <span class="text-primary">"specVersion"</span>: "1.0.0-beta.1",
  <span class="text-primary">"tool"</span>: { "name": "{{ tab.tool.name }}", "version": "{{ tab.tool.version }}" },
  <span class="text-primary">"runner"</span>: { "name": "{{ tab.runner.name }}", "version": "{{ tab.runner.version }}" },
  <span class="text-primary">"summary"</span>: { "entries": 42, "passed": 40, "failed": 2, "needsHuman": 2 },
  <span class="text-primary">"entries"</span>: [
    {
      "name": "checkout-summary",
      "status": "failed",
      "comparison": { "diffRatio": 0.0231, "threshold": 0.01 },
      "images": {
        "baseline": { "path": "{{ tab.images.baseline }}" },
        "actual":   { "path": "{{ tab.images.actual }}" },
        "diff":     { "path": "{{ tab.images.diff }}" }
      }
    }
  ]
}</pre>
    </div>
    <p class="text-xs text-muted">
      Every manifest has the same keys, statuses and three images per entry. Only <code>tool</code>, <code>runner</code> and the
      paths change, so a PR bot, a review app or the <NuxtLink to="/viewer" class="underline">viewer</NuxtLink> on this site can read any of them.
    </p>
  </div>
</template>

<style scoped>
.caret::after {
  content: '▌';
  animation: blink 1s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .caret::after {
    animation: none;
  }
}
</style>
