<script setup lang="ts">
// The tool list shared by /compare and the chapter-6 tool finder: one row per
// tool, each row opens to the details and the sources behind its claims.
import type { Collections } from '@nuxt/content';

type Tool = Collections['tools'];
defineProps<{ tools: Tool[] }>();

const open = ref(new Set<string>());
const toggle = (id: string) => {
  const next = new Set(open.value);
  if (!next.delete(id)) next.add(id);
  open.value = next;
};
</script>

<template>
  <div>
    <p class="border-b border-default px-3 py-1.5 text-xs text-muted">
      Select a tool to see its details and sources.
    </p>
    <ul class="divide-y divide-default text-sm">
      <li v-for="t in tools" :key="t.id">
        <div
          class="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 hover:bg-elevated/50"
          @click="toggle(t.id)"
        >
          <button
            type="button"
            class="-ml-1 flex size-5 shrink-0 items-center justify-center self-center rounded text-muted"
            :aria-expanded="open.has(t.id)"
            :aria-label="`Details for ${t.name}`"
            @click.stop="toggle(t.id)"
          >
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 transition-transform"
              :class="open.has(t.id) ? 'rotate-180' : ''"
            />
          </button>
          <a
            :href="t.website"
            target="_blank"
            rel="noopener"
            class="font-medium hover:underline"
            @click.stop
            >{{ t.name }}</a
          >
          <UBadge
            v-if="t.discontinued"
            color="error"
            variant="subtle"
            size="sm"
            class="-ml-1.5"
            >discontinued</UBadge
          >
          <span v-if="!t.openSource" class="-ml-1.5 text-xs text-muted"
            >proprietary</span
          >
          <span class="text-xs text-muted"
            >{{ TOOL_CATEGORIES[t.category] }} ·
            {{ toolLabel('hosting', t.hosting) }} ·
            {{ toolLabel('pricingModel', t.pricingModel) }}</span
          >
          <UBadge
            :color="resultsColor(t.machineReadableResults)"
            variant="subtle"
            size="sm"
            class="ml-auto"
          >
            {{ toolLabel('machineReadableResults', t.machineReadableResults) }}
          </UBadge>
        </div>
        <div v-if="open.has(t.id)" class="space-y-2 bg-elevated/30 px-3 py-3">
          <p
            v-if="t.discontinued"
            class="flex items-start gap-2 bg-error/10 px-3 py-2 text-sm text-error"
          >
            <UIcon
              name="i-lucide-triangle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            <span
              >{{ t.discontinued.message }}
              <a
                :href="t.discontinued.url"
                target="_blank"
                rel="noopener"
                class="underline"
                >Read the announcement</a
              >.</span
            >
          </p>
          <p>{{ t.summary }}</p>
          <dl
            class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]"
          >
            <dt class="text-muted">Runners</dt>
            <dd>{{ t.runners.join(', ') }}</dd>
            <dt class="text-muted">Diff engine</dt>
            <dd>{{ t.diffEngine }}</dd>
            <dt class="text-muted">Review</dt>
            <dd>
              {{
                t.reviewSurface
                  .map((s) => toolLabel('reviewSurface', s))
                  .join(', ')
              }}
            </dd>
            <dt class="text-muted">Baselines</dt>
            <dd>{{ toolLabel('baselineStorage', t.baselineStorage) }}</dd>
            <dt class="text-muted">Manifest</dt>
            <dd>
              <UBadge
                :color="manifestColor(t.manifestSupport)"
                variant="subtle"
                size="sm"
                >{{ toolLabel('manifestSupport', t.manifestSupport) }}</UBadge
              >
            </dd>
            <dt class="text-muted">License</dt>
            <dd>
              {{ t.license ?? (t.openSource ? 'open source' : 'proprietary') }}
            </dd>
            <dt class="text-muted">Self-hostable</dt>
            <dd>{{ t.selfHostable ? 'yes' : 'no' }}</dd>
            <template v-if="t.aliases?.length">
              <dt class="text-muted">Also known as</dt>
              <dd>{{ t.aliases.join(', ') }}</dd>
            </template>
          </dl>
          <ul v-if="t.notes?.length" class="list-disc pl-5 text-sm">
            <li v-for="note in t.notes" :key="note">{{ note }}</li>
          </ul>
          <p class="text-xs text-muted">
            Verified {{ t.lastVerified }} against
            <template v-for="(source, i) in t.sources" :key="source">
              <a
                :href="source"
                target="_blank"
                rel="noopener"
                class="underline"
                >{{ sourceLabel(source) }}</a
              ><span v-if="i < t.sources.length - 1">, </span> </template
            >.
            <a
              :href="`https://github.com/visual-regression/visual-regression/edit/main/apps/site/data/tools/${t.stem?.split('/').pop()}.yml`"
              target="_blank"
              rel="noopener"
              class="underline"
              >Correct this entry</a
            >
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>
