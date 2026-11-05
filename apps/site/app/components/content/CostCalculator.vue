<script setup lang="ts">
// The cost calculator on /compare: the volume a team produces per month, and
// for every tool in data/tools the plan from data/pricing that fits it and
// what that plan costs. Local tools cost CI time only; pixsame's hosted
// renderer is in preparation and not priced.
import type { Collections } from '@nuxt/content';

type Tool = Collections['tools'];
type Pricing = Collections['pricing'];
type Plan = Pricing['plans'][number];

const { data: tools } = await useAsyncData('tools', () =>
  queryCollection('tools').all(),
);
const { data: pricing } = await useAsyncData('pricing', () =>
  queryCollection('pricing').all(),
);

// GitHub-hosted Linux 2-core runners, the public per-minute rate:
// https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
const GITHUB_LINUX_PER_MINUTE = 0.006;
const GITHUB_PRICING_URL =
  'https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions';

const countMode = ref<'factors' | 'direct'>('factors');
const tests = ref(50);
const viewports = ref(2);
const browsers = ref(1);
const direct = ref(100);
const runsPerDay = ref(10);
const workingDays = ref(21);
const seats = ref(5);
const ciPerMinute = ref(GITHUB_LINUX_PER_MINUTE);
const secondsPerScreenshot = ref(2);

const num = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

const perRun = computed(() =>
  countMode.value === 'direct'
    ? Math.round(num(direct.value))
    : Math.round(num(tests.value) * num(viewports.value) * num(browsers.value)),
);
const volume = computed(
  () => perRun.value * num(runsPerDay.value) * num(workingDays.value),
);
const ciMinutes = computed(
  () => (volume.value * num(secondsPerScreenshot.value)) / 60,
);
const ciCost = computed(() => ciMinutes.value * num(ciPerMinute.value));

type Estimate =
  | {
      kind: 'plan';
      plan: Plan;
      cost: number;
      billedYearly: boolean;
      over: number;
      overCost: number;
    }
  | { kind: 'from'; plan: Plan; cost: number; billedYearly: boolean }
  | { kind: 'custom'; reason: string }
  | { kind: 'free' }
  | { kind: 'pixsame' };

type Row = { tool: Tool; pricing?: Pricing; estimate: Estimate };

const priceOf = (plan: Plan) => plan.monthly ?? plan.annualMonthly ?? null;
const billedYearly = (plan: Plan) =>
  plan.monthly == null && plan.annualMonthly != null;
const seatsFit = (plan: Plan, wanted: number) =>
  plan.included?.seats == null || wanted <= plan.included.seats;

/** The cheapest listed plan that holds `volume` screenshots and `wanted` seats. */
const fit = (p: Pricing, volume: number, wanted: number): Estimate => {
  const custom = p.plans.some((plan) => priceOf(plan) == null);
  const customOr = (reason: string): Estimate => ({
    kind: 'custom',
    reason: custom ? reason : `${reason}; no custom plan is listed either`,
  });

  if (p.unit === 'custom') {
    const paid = p.plans
      .filter((plan) => (priceOf(plan) ?? 0) > 0)
      .sort((a, b) => priceOf(a)! - priceOf(b)!)[0];
    return paid
      ? {
          kind: 'from',
          plan: paid,
          cost: priceOf(paid)!,
          billedYearly: billedYearly(paid),
        }
      : { kind: 'custom', reason: 'the page shows no prices' };
  }

  const candidates: Extract<Estimate, { kind: 'plan' }>[] = [];
  for (const plan of p.plans) {
    const price = priceOf(plan);
    if (price == null || !seatsFit(plan, wanted)) continue;
    if (p.unit === 'seat') {
      candidates.push({
        kind: 'plan',
        plan,
        cost: price * wanted,
        billedYearly: billedYearly(plan),
        over: 0,
        overCost: 0,
      });
      continue;
    }
    const included = plan.included?.snapshots;
    if (included == null) continue;
    const over = Math.max(0, volume - included);
    if (over && !plan.overage) continue;
    const overCost = over
      ? Math.ceil(over / plan.overage!.per) * plan.overage!.price
      : 0;
    candidates.push({
      kind: 'plan',
      plan,
      cost: price + overCost,
      billedYearly: billedYearly(plan),
      over,
      overCost,
    });
  }
  if (!candidates.length) {
    return customOr(
      p.unit === 'seat'
        ? `${wanted} seats exceed every listed plan`
        : `${volume.toLocaleString('en-US')} ${p.unit}s a month exceed every listed plan`,
    );
  }
  return candidates.sort(
    (a, b) => a.cost - b.cost || a.over - b.over || priceOf(a.plan)! - priceOf(b.plan)!,
  )[0]!;
};

const stem = (tool: Tool) => tool.stem?.split('/').pop() ?? tool.name;

const rows = computed<Row[]>(() => {
  const byTool = new Map((pricing.value ?? []).map((p) => [p.tool, p]));
  const all: Row[] = (tools.value ?? []).map((tool) => {
    const id = stem(tool);
    if (id === 'pixsame') return { tool, estimate: { kind: 'pixsame' } };
    const p = byTool.get(id);
    if (tool.pricingModel === 'free' || !p) {
      return { tool, estimate: { kind: 'free' } };
    }
    return { tool, pricing: p, estimate: fit(p, volume.value, num(seats.value)) };
  });
  const group = (e: Estimate) =>
    e.kind === 'plan' || e.kind === 'from' ? 0 : e.kind === 'custom' ? 1 : 2;
  const cost = (e: Estimate) =>
    e.kind === 'plan' || e.kind === 'from' ? e.cost : 0;
  return all.sort(
    (a, b) =>
      group(a.estimate) - group(b.estimate) ||
      cost(a.estimate) - cost(b.estimate) ||
      a.tool.name.localeCompare(b.tool.name),
  );
});

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value > 0 && value < 10 ? 2 : 0,
  });
/** Per-minute rates are fractions of a cent: keep up to four decimals. */
const rate = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
const count = (value: number) => Math.round(value).toLocaleString('en-US');

const confidenceColor = (value: Pricing['confidence']) =>
  value === 'high' ? 'primary' : value === 'medium' ? 'warning' : 'neutral';
</script>

<template>
  <div class="not-prose my-6 space-y-4">
    <div class="rounded-lg border border-default p-4">
      <div class="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <UFormField
          label="Screenshots per test run"
          help="Count them as tests × viewports × browsers, or enter the number your run produces."
          class="sm:col-span-2 lg:col-span-3"
        >
          <URadioGroup
            v-model="countMode"
            orientation="horizontal"
            :items="[
              { label: 'tests × viewports × browsers', value: 'factors' },
              { label: 'a number', value: 'direct' },
            ]"
            class="mb-2"
          />
          <div v-if="countMode === 'factors'" class="flex flex-wrap items-center gap-2">
            <UInputNumber v-model="tests" :min="0" aria-label="Tests" class="w-28" />
            <span class="text-muted">×</span>
            <UInputNumber v-model="viewports" :min="0" aria-label="Viewports" class="w-24" />
            <span class="text-muted">×</span>
            <UInputNumber v-model="browsers" :min="0" aria-label="Browsers" class="w-24" />
            <span class="text-sm text-muted">= {{ count(perRun) }} per run</span>
          </div>
          <UInputNumber v-else v-model="direct" :min="0" aria-label="Screenshots per run" class="w-36" />
        </UFormField>
        <UFormField label="Runs per day" help="Every push, pull request update or scheduled run that takes screenshots.">
          <UInputNumber v-model="runsPerDay" :min="0" class="w-32" />
        </UFormField>
        <UFormField label="Working days per month" help="Days on which the suite runs; 21 is a typical month.">
          <UInputNumber v-model="workingDays" :min="0" :max="31" class="w-32" />
        </UFormField>
        <UFormField label="Reviewers (seats)" help="People who approve or reject diffs; only matters for tools priced per seat or with a seat limit.">
          <UInputNumber v-model="seats" :min="1" class="w-32" />
        </UFormField>
        <UFormField label="CI price per minute (USD)" help="For tools that run on your CI. Default: GitHub-hosted Linux runners, $0.006 per minute.">
          <UInputNumber v-model="ciPerMinute" :min="0" :step="0.001" :format-options="{ maximumFractionDigits: 4 }" class="w-32" />
        </UFormField>
        <UFormField label="Seconds per screenshot" help="Page load, capture and comparison on the CI machine; 2 seconds is a plain page, component suites are faster.">
          <UInputNumber v-model="secondsPerScreenshot" :min="0" :step="0.5" :format-options="{ maximumFractionDigits: 2 }" class="w-32" />
        </UFormField>
      </div>
      <p class="mt-4 text-sm">
        <strong>{{ count(volume) }}</strong> screenshots per month
        <span class="text-muted">({{ count(perRun) }} per run × {{ count(num(runsPerDay)) }} runs per day × {{ count(num(workingDays)) }} days)</span>,
        about <strong>{{ count(ciMinutes) }}</strong> CI minutes
        <span class="text-muted">({{ money(ciCost) }} at {{ rate(num(ciPerMinute)) }}/min)</span>.
      </p>
    </div>

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-default text-xs text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">Tool</th>
            <th class="px-3 py-2 font-medium">Plan that fits</th>
            <th class="px-3 py-2 font-medium">Estimate per month</th>
            <th class="px-3 py-2 font-medium">Checked</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="{ tool, pricing: p, estimate } in rows" :key="tool.id" class="align-top">
            <td class="px-3 py-2">
              <a :href="tool.website" target="_blank" rel="noopener" class="font-medium hover:underline">{{ tool.name }}</a>
              <UBadge v-if="tool.discontinued" color="error" variant="subtle" size="sm" class="ml-1.5">discontinued</UBadge>
              <div class="text-xs text-muted">{{ toolLabel('hosting', tool.hosting) }} · {{ toolLabel('pricingModel', tool.pricingModel) }}</div>
            </td>
            <template v-if="estimate.kind === 'plan'">
              <td class="px-3 py-2">
                {{ estimate.plan.name }}
                <div class="text-xs text-muted">
                  <template v-if="p!.unit === 'seat'">{{ money(priceOf(estimate.plan)!) }} per seat × {{ count(num(seats)) }}</template>
                  <template v-else-if="estimate.plan.included?.snapshots != null">{{ count(estimate.plan.included.snapshots) }} {{ p!.unit }}s included</template>
                  <template v-if="estimate.billedYearly"> · billed yearly</template>
                  <template v-else-if="estimate.plan.annualMonthly != null"> · {{ money(estimate.plan.annualMonthly) }} when billed yearly</template>
                </div>
              </td>
              <td class="px-3 py-2">
                <span class="font-medium">{{ money(estimate.cost) }}</span>
                <div v-if="estimate.over" class="text-xs text-muted">
                  includes {{ money(estimate.overCost) }} overage for {{ count(estimate.over) }} {{ p!.unit }}s over the plan
                </div>
                <div v-else-if="estimate.cost === 0" class="text-xs text-muted">free tier</div>
              </td>
            </template>
            <template v-else-if="estimate.kind === 'from'">
              <td class="px-3 py-2">
                {{ estimate.plan.name }}
                <div class="text-xs text-muted">{{ estimate.plan.notes?.[0] ?? 'not metered per screenshot' }}</div>
              </td>
              <td class="px-3 py-2">
                <span class="font-medium">from {{ money(estimate.cost) }}</span>
                <div class="text-xs text-muted">entry price only<template v-if="estimate.billedYearly">, billed yearly</template>; see the notes</div>
              </td>
            </template>
            <template v-else-if="estimate.kind === 'custom'">
              <td class="px-3 py-2 text-muted">—</td>
              <td class="px-3 py-2">
                <span class="font-medium">custom quote</span>
                <div class="text-xs text-muted">{{ estimate.reason }}</div>
              </td>
            </template>
            <template v-else-if="estimate.kind === 'pixsame'">
              <td class="px-3 py-2">
                Local plugin
                <div class="text-xs text-muted">hosted renderer in preparation, not priced</div>
              </td>
              <td class="px-3 py-2">
                <span class="font-medium">free, CI time only</span>
                <div class="text-xs text-muted">about {{ money(ciCost) }} for {{ count(ciMinutes) }} CI minutes</div>
              </td>
            </template>
            <template v-else>
              <td class="px-3 py-2 text-muted">—</td>
              <td class="px-3 py-2">
                <span class="font-medium">free, CI time only</span>
                <div class="text-xs text-muted">about {{ money(ciCost) }} for {{ count(ciMinutes) }} CI minutes</div>
              </td>
            </template>
            <td class="px-3 py-2 text-xs text-muted">
              <template v-if="p">
                {{ p.fetchedAt }}
                <UBadge :color="confidenceColor(p.confidence)" variant="subtle" size="sm" class="ml-1">{{ p.confidence }}</UBadge>
                <div>
                  <a :href="p.pricingPage" target="_blank" rel="noopener" class="underline">pricing page</a>
                  ·
                  <a :href="`https://github.com/visual-regression/visual-regression/edit/main/apps/site/data/pricing/${stem(tool)}.yml`" target="_blank" rel="noopener" class="underline">correct</a>
                </div>
              </template>
              <template v-else>{{ tool.lastVerified }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <details class="rounded-lg border border-default px-4 py-3 text-sm">
      <summary class="font-medium">How this is computed</summary>
      <div class="mt-3 space-y-2">
        <p>
          <strong>Volume.</strong> {{ count(perRun) }} screenshots per run × {{ count(num(runsPerDay)) }} runs per day × {{ count(num(workingDays)) }} working days = <strong>{{ count(volume) }}</strong> screenshots per month. One screenshot here is one image in one viewport in one browser; vendors call it a snapshot or a screenshot and count it the same way, except where the notes say otherwise.
        </p>
        <p>
          <strong>Plan that fits.</strong> For a vendor that meters snapshots or screenshots, every listed plan with a price is tried: the plan fits when its included amount covers the volume, or when it covers part of it and the page lists an overage price, in which case the overage is <em>(volume − included) ÷ block size × block price</em>, rounded up to whole blocks. The cheapest fitting plan wins. Where the plan also limits seats, the seats entered must fit. For a vendor that bills per seat, the estimate is <em>price per seat × seats</em> on the cheapest plan whose seat limit holds. When no listed plan fits, the row says "custom quote". Month-to-month prices are used; when a page shows only a yearly price, the row says "billed yearly".
        </p>
        <p>
          <strong>Entry price only.</strong> Vendors that meter something else (checkpoints, hosted devices) show their cheapest paid plan as "from", because the volume above does not map to their unit.
        </p>
        <p>
          <strong>CI time.</strong> Tools that run on your own CI are free; what they cost is runner time: <em>{{ count(volume) }} screenshots × {{ num(secondsPerScreenshot) }} s ÷ 60 = {{ count(ciMinutes) }} minutes</em>, at {{ rate(num(ciPerMinute)) }} per minute = {{ money(ciCost) }}. The default rate is the public price of GitHub-hosted Linux 2-core runners (<a :href="GITHUB_PRICING_URL" target="_blank" rel="noopener" class="underline">GitHub's billing page</a>); included minutes and self-hosted runners make it lower. Hosted services also spend CI time on capture, which the table does not add to their row.
        </p>
        <p>
          <strong>Not included.</strong> Taxes, add-ons (SSO, extra browsers), yearly discounts unless the page shows no monthly price, and the free trials.
        </p>
      </div>
    </details>

    <p class="text-xs text-muted">
      The numbers come from each vendor's pricing page on the date in the "Checked" column, read by a script and by people; the confidence badge says how directly the page states them. Vendors change plans without notice. Check the pricing page before buying, and <a href="https://github.com/visual-regression/visual-regression/tree/main/apps/site/data/pricing" target="_blank" rel="noopener" class="underline">correct the data</a> if it is wrong.
    </p>
  </div>
</template>
