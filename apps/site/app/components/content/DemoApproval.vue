<script setup lang="ts">
// Chapter 4: the review step. Three failed comparisons from one pull request,
// each either approved (the actual becomes the baseline) or rejected (the PR
// gets fixed). "Approve all" is there because every tool has it.
type Status = 'failed' | 'approved' | 'rejected';
interface Entry {
  name: string;
  test: string;
  diffRatio: number;
  what: string;
  honest: 'intended' | 'bug';
  baseline: Record<string, string>;
  actual: Record<string, string>;
  status: Status;
}
const initial = (): Entry[] => [
  {
    name: 'header-desktop',
    test: 'header.spec.ts › shows the new logo',
    diffRatio: 0.021,
    what: 'The logo moved 8px to the left to align with the content.',
    honest: 'intended',
    baseline: { '--logo-x': '18%' },
    actual: { '--logo-x': '8%' },
    status: 'failed',
  },
  {
    name: 'pricing-card',
    test: 'pricing.spec.ts › yearly plan',
    diffRatio: 0.004,
    what: 'The yearly price reads $4.20 instead of $42.00: a formatting bug.',
    honest: 'bug',
    baseline: { '--price': '"$42.00"' },
    actual: { '--price': '"$4.20"' },
    status: 'failed',
  },
  {
    name: 'footer-links',
    test: 'footer.spec.ts › legal links',
    diffRatio: 0.013,
    what: 'Footer links switched from grey to the brand colour, as designed.',
    honest: 'intended',
    baseline: { '--link': '#a1a1aa' },
    actual: { '--link': '#10b981' },
    status: 'failed',
  },
];
const entries = ref<Entry[]>(initial());
const approvedAll = ref(false);

const set = (e: Entry, status: Status) => {
  e.status = status;
  if (status === 'approved') e.baseline = { ...e.actual };
};
const approveAll = () => {
  entries.value.forEach((e) => e.status === 'failed' && set(e, 'approved'));
  approvedAll.value = true;
};
const reset = () => {
  entries.value = initial();
  approvedAll.value = false;
};
const summary = computed(() => ({
  needsHuman: entries.value.filter((e) => e.status === 'failed').length,
  approved: entries.value.filter((e) => e.status === 'approved').length,
  rejected: entries.value.filter((e) => e.status === 'rejected').length,
}));
const shippedBug = computed(() => entries.value.some((e) => e.honest === 'bug' && e.status === 'approved'));
const color = (s: Status) => (s === 'failed' ? 'error' : s === 'approved' ? 'success' : 'warning');
</script>

<template>
  <div class="not-prose my-6 space-y-4">
    <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
      <span class="rounded-md border border-default bg-elevated px-3 py-2">
        summary.needsHuman <b>{{ summary.needsHuman }}</b> · approved <b>{{ summary.approved }}</b> · rejected
        <b>{{ summary.rejected }}</b>
      </span>
      <UButton size="xs" variant="outline" color="neutral" class="ml-auto" :disabled="summary.needsHuman === 0" @click="approveAll">
        Approve all
      </UButton>
      <UButton size="xs" variant="ghost" color="neutral" @click="reset">Reset</UButton>
    </div>

    <ul class="space-y-3">
      <li v-for="e in entries" :key="e.name" class="rounded-lg border border-default p-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span class="font-semibold">{{ e.name }}</span>
          <UBadge :color="color(e.status)" variant="subtle" size="sm">{{ e.status }}</UBadge>
          <span class="font-mono text-xs text-muted">diffRatio {{ e.diffRatio }} · {{ e.test }}</span>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <figure class="min-w-0">
            <div class="shot" :style="e.baseline"><i class="logo"></i><span class="price"></span><i class="link"></i><i class="link"></i></div>
            <figcaption class="mt-1 font-mono text-xs text-muted">baseline</figcaption>
          </figure>
          <figure class="min-w-0">
            <div class="shot" :style="e.actual"><i class="logo"></i><span class="price"></span><i class="link"></i><i class="link"></i></div>
            <figcaption class="mt-1 font-mono text-xs text-muted">actual</figcaption>
          </figure>
          <div class="flex gap-2 sm:flex-col">
            <UButton size="xs" color="primary" :disabled="e.status !== 'failed'" @click="set(e, 'approved')">Approve</UButton>
            <UButton size="xs" color="neutral" variant="outline" :disabled="e.status !== 'failed'" @click="set(e, 'rejected')">
              It's a bug
            </UButton>
          </div>
        </div>
        <p v-if="e.status !== 'failed'" class="mt-2 text-xs text-muted">
          {{ e.what }}
          <template v-if="e.status === 'approved'"> The actual image is now the baseline.</template>
          <template v-else> The PR gets fixed; the baseline stays.</template>
        </p>
      </li>
    </ul>

    <UAlert
      v-if="shippedBug"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="A bug just became the baseline"
      :description="approvedAll ? 'Three approvals in one click, and the $4.20 price is now what the test expects. The next run passes without anyone looking.' : 'The $4.20 price is now what the test expects, and the next run will pass.'"
    />
    <p class="text-xs text-muted">
      Look at each pair before deciding. The pull request's reviewer should do the clicking, not its author.
    </p>
  </div>
</template>

<style scoped>
.shot {
  --logo-x: 18%;
  --price: '$42.00';
  --link: #a1a1aa;
  position: relative;
  aspect-ratio: 16 / 7;
  border-radius: 6px;
  background: #f4f4f5;
  overflow: hidden;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.shot .logo {
  position: absolute;
  top: 12%;
  left: var(--logo-x);
  width: 14%;
  height: 16%;
  border-radius: 3px;
  background: #18181b;
}
.shot .price::before {
  content: var(--price);
  position: absolute;
  right: 8%;
  top: 36%;
  font-size: clamp(11px, 2.4vw, 16px);
  font-weight: 700;
  color: #18181b;
}
.shot .link {
  position: absolute;
  bottom: 14%;
  width: 18%;
  height: 7%;
  border-radius: 2px;
  background: var(--link);
}
.shot .link:nth-of-type(2) {
  left: 8%;
}
.shot .link:nth-of-type(3) {
  left: 30%;
}
</style>
