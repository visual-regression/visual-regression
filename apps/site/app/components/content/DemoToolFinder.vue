<script setup lang="ts">
// Chapter 6: the four questions as filters over the comparison data. The rules
// below are the chapter's reasoning written as predicates on `data/tools/*.yml`;
// nothing is picked by hand, so a tool shows up or drops out because of its entry.
const { data: tools } = await useAsyncData('tool-finder', () => queryCollection('tools').all());
type Tool = NonNullable<typeof tools.value>[number];
type Rule = (t: Tool) => boolean;

const matchesRunner = (t: Tool, re: RegExp) => t.runners.some((r) => re.test(r));

interface Question {
  key: string;
  legend: string;
  items: { value: string; label: string; rule: Rule }[];
}
const any = () => true;
const QUESTIONS: Question[] = [
  {
    key: 'subject',
    legend: '1. What do you screenshot?',
    items: [
      { value: 'any', label: 'Not decided yet', rule: any },
      {
        value: 'components',
        label: 'Components in isolation (a design system, a Storybook)',
        rule: (t) => matchesRunner(t, /storybook|ladle|histoire|vitest|any \(/i),
      },
      {
        value: 'pages',
        label: 'Pages and flows in a real browser',
        rule: (t) =>
          t.category !== 'mobile-native' &&
          matchesRunner(t, /cypress|playwright|puppeteer|selenium|webdriverio|standalone|page list|session|any \(/i),
      },
      { value: 'native', label: 'Native screens (Android, iOS, Flutter)', rule: (t) => t.category === 'mobile-native' },
    ],
  },
  {
    key: 'where',
    legend: '2. Where should comparison and review happen?',
    items: [
      { value: 'any', label: 'Not decided yet', rule: any },
      { value: 'local', label: 'Locally and in my CI, images on disk, nothing to pay', rule: (t) => t.hosting === 'local' || t.hosting === 'local-or-cloud' },
      { value: 'hosted', label: 'A hosted service with a review UI on day one', rule: (t) => t.hosting === 'cloud' || t.hosting === 'local-or-cloud' },
      {
        value: 'self-hosted',
        label: 'A service I run myself',
        rule: (t) => t.hosting === 'self-hosted' || (t.category === 'hosted-review' && t.selfHostable),
      },
    ],
  },
  {
    key: 'renderer',
    legend: '3. Can you run comparisons in a pinned renderer?',
    items: [
      { value: 'any', label: 'Not sure yet', rule: any },
      { value: 'yes', label: 'Yes, one Docker image for everyone', rule: any },
      {
        value: 'no',
        label: 'No: many contributors, many machines, no Docker in CI',
        // repository baselines compared on whatever machine ran the tests will flake
        rule: (t) => t.baselineStorage !== 'repo',
      },
    ],
  },
  {
    key: 'readback',
    legend: '4. What do you need to read back after the run?',
    items: [
      { value: 'any', label: 'Nothing beyond pass or fail', rule: any },
      {
        value: 'json',
        label: 'A machine-readable result I can build a PR comment or approval job on',
        rule: (t) => t.machineReadableResults === 'manifest' || t.machineReadableResults === 'json-report',
      },
      {
        value: 'manifest',
        label: 'The manifest, so the review step survives a change of tool',
        rule: (t) => t.manifestSupport !== 'none',
      },
    ],
  },
];

// diff engines are libraries the tools above are built on, not a choice for any of the four questions
const candidates = computed(() => (tools.value ?? []).filter((t) => t.category !== 'diff-engine'));

const answers = reactive<Record<string, string>>(Object.fromEntries(QUESTIONS.map((q) => [q.key, 'any'])));
const ruleFor = (q: Question) => q.items.find((i) => i.value === answers[q.key])?.rule ?? any;

const left = computed(() =>
  candidates.value.filter((t) => QUESTIONS.every((q) => ruleFor(q)(t))).sort((a, b) => a.name.localeCompare(b.name)),
);
/** How many tools each question's current answer removes on its own, given the other answers. */
const removedBy = (q: Question) => {
  const others = QUESTIONS.filter((o) => o !== q);
  const pool = candidates.value.filter((t) => others.every((o) => ruleFor(o)(t)));
  return pool.length - pool.filter(ruleFor(q)).length;
};
const answered = computed(() => QUESTIONS.filter((q) => answers[q.key] !== 'any').length);
const reset = () => QUESTIONS.forEach((q) => (answers[q.key] = 'any'));

const compareLink = computed(() => {
  const q = new URLSearchParams();
  if (answers.subject === 'native') q.set('category', 'mobile-native');
  if (answers.readback === 'manifest') q.set('manifest', '1');
  const s = q.toString();
  return s ? `/compare?${s}` : '/compare';
});
const resultsColor = (value: string) =>
  value === 'manifest' || value === 'json-report' ? 'primary' : value === 'images-only' ? 'warning' : 'neutral';
</script>

<template>
  <div class="not-prose my-6 space-y-4">
    <div class="grid gap-4 md:grid-cols-2">
      <fieldset v-for="q in QUESTIONS" :key="q.key" class="min-w-0 rounded-lg border border-default p-3">
        <legend class="px-1 text-sm font-medium text-highlighted">{{ q.legend }}</legend>
        <URadioGroup v-model="answers[q.key]" :items="q.items" size="sm" class="mt-1" />
        <p v-if="answers[q.key] !== 'any'" class="mt-2 text-xs text-muted">
          <template v-if="removedBy(q) > 0">Removes {{ removedBy(q) }} of the tools the other answers leave.</template>
          <template v-else>Removes nothing the other answers had not already.</template>
        </p>
      </fieldset>
    </div>

    <div class="rounded-lg border border-default">
      <p class="flex flex-wrap items-baseline gap-x-2 border-b border-default bg-elevated px-3 py-2 text-sm">
        <span class="font-medium text-highlighted">{{ left.length }} of {{ candidates.length }} tools left</span>
        <span class="text-xs text-muted">after {{ answered }} of 4 answers</span>
        <UButton v-if="answered" size="xs" variant="ghost" color="neutral" class="ml-auto" @click="reset">Reset</UButton>
      </p>
      <ul v-if="left.length" class="divide-y divide-default text-sm">
        <li v-for="t in left" :key="t.id" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
          <a :href="t.website" target="_blank" rel="noopener" class="font-medium hover:underline">{{ t.name }}</a>
          <span class="text-xs text-muted">{{ TOOL_CATEGORIES[t.category] }} · {{ toolLabel('hosting', t.hosting) }} · {{ toolLabel('pricingModel', t.pricingModel) }}</span>
          <UBadge :color="resultsColor(t.machineReadableResults)" variant="subtle" size="sm" class="ml-auto">
            {{ toolLabel('machineReadableResults', t.machineReadableResults) }}
          </UBadge>
        </li>
      </ul>
      <p v-else class="px-3 py-6 text-center text-sm text-muted">
        Nothing fits all four answers. Loosen one; you are hitting the trade-offs the chapter describes.
      </p>
      <p class="border-t border-default px-3 py-2 text-xs text-muted">
        Diff engines (pixelmatch, odiff, …) are left out because these tools are built on them.
        <NuxtLink :to="compareLink" class="underline">See every column in the comparison</NuxtLink>, or correct a tool's entry from there.
      </p>
    </div>
  </div>
</template>
