<script setup lang="ts">
/**
 * A client-side viewer for `visual-regression-manifest.json` files: the
 * manifests and images never leave the browser. A run can come as a folder,
 * as a zip (dropped, chosen, or fetched from a URL by the browser) or as
 * several of those. It mirrors the package's
 * merge rules (identity = name + test file + platform + renderer + variant,
 * a later CI attempt wins) without importing the Node-only package.
 */
type Status =
  | 'passed'
  | 'failed'
  | 'missing-baseline'
  | 'created'
  | 'updated'
  | 'approved';

type Entry = {
  name: string;
  test: { filePath: string; titlePath: string[]; retry: number };
  status: Status;
  comparison: { diffRatio: number; maxDiffRatio?: number; colorThreshold?: number; colorMetric?: string };
  images: {
    baseline: { path: string; width?: number; height?: number };
    actual: { path: string | null; width?: number; height?: number };
    diff: { path: string | null };
  };
  platform?: { osPlatform: string; browser?: { name: string; version?: string } };
  renderer?: { backend: string; name?: string; browser?: string };
  variant?: string;
  viewport?: { width: number; height: number };
  message: string;
  recordedAt: string;
};

type Manifest = {
  reportFormat: string;
  specVersion: string;
  projectRoot: string;
  ci: { runAttempt?: string; buildId?: string; pullRequest?: { number: number } | null } | null;
  tool: { name: string; version?: string };
  runner: { name: string; version?: string };
  entries: Entry[];
};

type Loaded = {
  label: string;
  manifest: Manifest;
  attempt: number;
};

type Shown = Entry & {
  key: string;
  source: string;
  urls: { baseline?: string; actual?: string; diff?: string };
};

const NEEDS_HUMAN: Status[] = ['failed', 'missing-baseline'];
const MANIFEST_NAME = /^visual-regression-manifest(\..+)?\.json$/;

const files = ref<RunFile[]>([]);
const manifests = ref<Loaded[]>([]);
const errors = ref<string[]>([]);
const selected = ref<string | null>(null);
const slider = ref(50);
const dragging = ref(false);
const busy = ref('');
const zipUrl = ref('');
const fromZip = ref(false);
const urls = new Map<string, string>();

const urlFor = (file: File) => {
  const key = `${file.name}:${file.size}:${file.lastModified}`;
  let url = urls.get(key);
  if (!url) {
    url = URL.createObjectURL(file);
    urls.set(key, url);
  }
  return url;
};
onBeforeUnmount(() => {
  for (const url of urls.values()) URL.revokeObjectURL(url);
});

/**
 * Finds the dropped file whose path ends with the manifest's project-relative
 * path. When several files end the same way equally well none is returned and
 * `warn` is told: showing the screenshot of another test would be worse than
 * showing none.
 */
const findFile = (relative: string | null, warn: (message: string) => void) => {
  if (!relative) return undefined;
  const wanted = relative.replace(/^(\.\.\/)+/, '').split('/');
  let best: RunFile[] = [];
  let bestScore = 0;
  for (const candidate of files.value) {
    const parts = candidate.path.split('/');
    let score = 0;
    while (
      score < wanted.length &&
      score < parts.length &&
      parts[parts.length - 1 - score] === wanted[wanted.length - 1 - score]
    ) {
      score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = [candidate];
    } else if (score === bestScore && score > 0) {
      best.push(candidate);
    }
  }
  if (best.length > 1) {
    warn(`${relative} matches ${best.length} files equally well (${best.map((f) => f.path).join(', ')}), so it is not shown`);
    return undefined;
  }
  return best[0];
};

const platformLabel = (entry: Entry) => {
  const parts = [
    entry.platform?.osPlatform,
    entry.platform?.browser?.name,
    entry.variant,
  ].filter(Boolean);
  const renderer =
    entry.renderer && entry.renderer.backend !== 'native'
      ? [entry.renderer.backend, entry.renderer.name ?? entry.renderer.browser]
          .filter(Boolean)
          .join(' ')
      : '';
  const platform = parts.join(' / ');
  return renderer ? (platform ? `${platform} (${renderer})` : renderer) : platform;
};

const entryKey = (entry: Entry) =>
  [
    entry.name,
    entry.test.filePath,
    entry.platform?.osPlatform ?? '',
    entry.platform?.browser?.name ?? '',
    entry.renderer && entry.renderer.backend !== 'native'
      ? `${entry.renderer.backend} ${entry.renderer.name ?? entry.renderer.browser ?? ''}`
      : '',
    entry.variant ?? '',
  ].join('\u0000');

const run = computed(() => {
  const byKey = new Map<string, Shown>();
  const warnings = new Set<string>();
  const warn = (message: string) => warnings.add(message);
  for (const { label, manifest, attempt } of manifests.value) {
    for (const entry of manifest.entries) {
      const key = entryKey(entry);
      const existing = byKey.get(key);
      if (existing && existingAttempt.get(key)! > attempt) continue;
      existingAttempt.set(key, attempt);
      byKey.set(key, {
        ...entry,
        key,
        source: label,
        urls: {
          baseline: (() => {
            const f = findFile(entry.images.baseline.path, warn);
            return f && urlFor(f.file);
          })(),
          actual: (() => {
            const f = findFile(entry.images.actual.path, warn);
            return f && urlFor(f.file);
          })(),
          diff: (() => {
            const f = findFile(entry.images.diff.path, warn);
            return f && urlFor(f.file);
          })(),
        },
      });
    }
  }
  const order = (e: Shown) => (NEEDS_HUMAN.includes(e.status) ? 0 : 1);
  const entries = [...byKey.values()].sort(
    (a, b) =>
      order(a) - order(b) ||
      a.test.filePath.localeCompare(b.test.filePath) ||
      a.name.localeCompare(b.name),
  );
  return { entries, warnings: [...warnings] };
});
const merged = computed<Shown[]>(() => run.value.entries);
const warnings = computed(() => run.value.warnings);
const existingAttempt = new Map<string, number>();

const counts = computed(() => {
  const c: Record<Status, number> = {
    passed: 0,
    failed: 0,
    'missing-baseline': 0,
    created: 0,
    updated: 0,
    approved: 0,
  };
  for (const e of merged.value) c[e.status] += 1;
  return c;
});
const needsHuman = computed(() => merged.value.filter((e) => NEEDS_HUMAN.includes(e.status)));
const rest = computed(() => merged.value.filter((e) => !NEEDS_HUMAN.includes(e.status)));
const current = computed(() => merged.value.find((e) => e.key === selected.value) ?? null);

const statusColor = (status: Status) =>
  status === 'failed'
    ? 'error'
    : status === 'missing-baseline'
      ? 'warning'
      : status === 'passed'
        ? 'success'
        : 'info';

const percent = (ratio: number) =>
  ratio === 0 ? '0%' : ratio < 0.0001 ? '<0.01%' : `${(ratio * 100).toFixed(2)}%`;

const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const load = async (incoming: RunFile[], earlier: string[] = []) => {
  errors.value = [...earlier];
  existingAttempt.clear();
  try {
    busy.value = incoming.some(({ file }) => isZipName(file.name)) ? 'Unpacking…' : '';
    incoming = await expandZips(incoming);
  } catch (error) {
    errors.value.push((error as Error).message);
    incoming = [];
  } finally {
    busy.value = '';
  }
  files.value = incoming;
  const found: Loaded[] = [];
  for (const { path, file } of incoming) {
    if (!MANIFEST_NAME.test(file.name)) continue;
    try {
      const json = JSON.parse(await readText(file)) as Partial<Manifest>;
      if (
        json.reportFormat !== 'visual-regression-manifest' ||
        !Array.isArray(json.entries)
      ) {
        errors.value.push(`${path}: not a visual regression manifest (reportFormat ${JSON.stringify(json.reportFormat)})`);
        continue;
      }
      found.push({
        label: path,
        manifest: json as Manifest,
        attempt: Number.parseInt(String(json.ci?.runAttempt ?? '1'), 10) || 1,
      });
    } catch (error) {
      errors.value.push(`${path}: ${(error as Error).message}`);
    }
  }
  manifests.value = found;
  if (found.length === 0 && errors.value.length === 0) {
    errors.value.push('No visual-regression-manifest*.json file among the dropped files.');
  }
  selected.value = merged.value[0]?.key ?? null;
};

/** Fetches the zips in the visitor's browser and shows what is in them. */
const loadAddresses = async (addresses: string[]) => {
  busy.value = 'Fetching…';
  const results = await Promise.allSettled(addresses.map(fetchRunFiles));
  const fetched = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failures = results.flatMap((r) =>
    r.status === 'rejected' ? [(r.reason as Error).message] : [],
  );
  busy.value = '';
  await load(fetched, failures);
  fromZip.value = manifests.value.length > 0;
};

const submitUrl = async () => {
  const address = zipUrl.value.trim();
  if (!address) return;
  await navigateTo({ query: { zip: address }, hash: '' }, { replace: true });
  await loadAddresses([address]);
};

const onInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    file,
  }));
  void load(list);
};

/** Reads dropped directories recursively through the File System Entry API. */
const readEntry = (entry: FileSystemEntry, prefix: string): Promise<{ path: string; file: File }[]> =>
  new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([{ path: `${prefix}${entry.name}`, file }]),
        () => resolve([]),
      );
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const all: FileSystemEntry[] = [];
      const next = () =>
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            const nested = await Promise.all(
              all.map((child) => readEntry(child, `${prefix}${entry.name}/`)),
            );
            resolve(nested.flat());
          } else {
            all.push(...batch);
            next();
          }
        }, () => resolve([]));
      next();
    } else {
      resolve([]);
    }
  });

const onDrop = async (event: DragEvent) => {
  dragging.value = false;
  const items = Array.from(event.dataTransfer?.items ?? []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length > 0) {
    const nested = await Promise.all(entries.map((e) => readEntry(e, '')));
    void load(nested.flat());
    return;
  }
  const dropped = Array.from(event.dataTransfer?.files ?? []).map((file) => ({
    path: file.name,
    file,
  }));
  void load(dropped);
};

// the run behind chapter 5's artifact demo, regenerated from `?demo=ci`
const route = useRoute();
const fromDemo = ref(false);
onMounted(async () => {
  if (route.query.demo === DEMO_RUN_ID) {
    const { produced } = await generateDemoRun();
    fromDemo.value = true;
    await load(toDemoFiles(produced, demoOptionsFromQuery(route.query)));
    return;
  }
  // `?zip=<url>`, or `#zip=<url>` for an address that must not reach the server
  const addresses = zipAddressesOf(route.query.zip, route.hash);
  if (addresses.length > 0) await loadAddresses(addresses);
});

const reset = () => {
  if (fromDemo.value || fromZip.value || route.query.zip || route.hash) {
    void navigateTo({ query: {}, hash: '' }, { replace: true });
  }
  fromDemo.value = false;
  fromZip.value = false;
  zipUrl.value = '';
  files.value = [];
  manifests.value = [];
  errors.value = [];
  selected.value = null;
};
</script>

<template>
  <ClientOnly>
    <div class="not-prose my-6 space-y-4">
      <div
        v-if="manifests.length === 0"
        class="rounded-lg border-2 border-dashed p-6 text-center transition sm:p-8"
        :class="dragging ? 'border-primary bg-primary/5' : 'border-default'"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <UIcon name="i-lucide-folder-input" class="mx-auto mb-3 size-8 text-muted" />
        <p class="font-medium">Drop the run folder, or a zip of it, here</p>
        <p class="mt-1 text-sm text-muted">
          The folder (or the artifact zip) that holds
          <code class="break-all">visual-regression-manifest.json</code> and the screenshots. Nothing is uploaded.
        </p>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <label>
            <span class="cursor-pointer rounded-md bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-accented">
              or choose a folder
            </span>
            <input
              type="file"
              multiple
              webkitdirectory
              class="sr-only"
              @change="onInput"
            />
          </label>
          <label>
            <span class="cursor-pointer rounded-md bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-accented">
              or choose a zip
            </span>
            <input
              type="file"
              multiple
              accept=".zip,application/zip"
              class="sr-only"
              @change="onInput"
            />
          </label>
        </div>
        <form class="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center" @submit.prevent="submitUrl">
          <input
            v-model="zipUrl"
            type="url"
            required
            placeholder="https://example.com/artifact.zip"
            aria-label="Address of a zip"
            class="min-w-0 rounded-md border border-default bg-default px-3 py-1.5 text-sm sm:w-96"
          />
          <UButton type="submit" size="sm" color="neutral" variant="subtle" :loading="!!busy">
            Load a zip from a URL
          </UButton>
        </form>
        <p class="mt-1 text-xs text-muted">
          Your browser fetches the zip, so the server has to allow cross-origin requests (CORS).
          Link straight to a zip with <code>?zip=&lt;url&gt;</code>, or <code>#zip=&lt;url&gt;</code> when the
          address must not reach this site's server.
        </p>
        <p v-if="busy" class="mt-3 text-sm text-muted" role="status">{{ busy }}</p>
        <ul v-if="errors.length" class="mt-4 space-y-1 text-left text-sm text-error">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <template v-else>
        <UAlert
          v-if="fromDemo"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="Demo run loaded"
          description="This is the artifact you built in the guide. If you have your own report to view, click &quot;Load another run&quot; and drop your own run folder."
          close
          :actions="[{ label: 'Back to Running in CI', to: '/learn/running-in-ci#keep-the-images', color: 'neutral', variant: 'outline', size: 'xs' }]"
          @update:open="fromDemo = false"
        />
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UBadge color="error" variant="subtle">{{ counts.failed }} failed</UBadge>
          <UBadge color="warning" variant="subtle">{{ counts['missing-baseline'] }} missing baseline</UBadge>
          <UBadge color="success" variant="subtle">{{ counts.passed }} passed</UBadge>
          <UBadge color="info" variant="subtle">
            {{ counts.created + counts.updated + counts.approved }} baselines written
          </UBadge>
          <span class="text-muted">
            from {{ manifests.length }} manifest{{ manifests.length === 1 ? '' : 's' }},
            {{ manifests[0]?.manifest.tool.name }}
            {{ manifests[0]?.manifest.tool.version ?? '' }}
            on {{ manifests[0]?.manifest.runner.name }}
          </span>
          <UButton size="xs" variant="ghost" color="neutral" class="ml-auto" @click="reset">
            Load another run
          </UButton>
        </div>
        <ul v-if="errors.length" class="space-y-1 text-sm text-error">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
        <ul v-if="warnings.length" class="space-y-1 text-sm text-warning">
          <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
        </ul>

        <div class="grid gap-4 lg:grid-cols-[280px_1fr]">
          <nav class="max-h-[70vh] overflow-y-auto rounded-lg border border-default text-sm">
            <template v-for="group in [{ title: 'Needs a human', items: needsHuman }, { title: 'Everything else', items: rest }]" :key="group.title">
              <div v-if="group.items.length" class="sticky top-0 bg-elevated px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                {{ group.title }} · {{ group.items.length }}
              </div>
              <button
                v-for="entry in group.items"
                :key="entry.key"
                type="button"
                class="flex w-full items-start gap-2 border-t border-default px-3 py-2 text-left hover:bg-elevated/50"
                :class="entry.key === selected && 'bg-primary/10'"
                @click="selected = entry.key; slider = 50"
              >
                <UBadge :color="statusColor(entry.status)" variant="solid" size="xs" class="mt-0.5 shrink-0">
                  {{ entry.status === 'missing-baseline' ? 'new' : entry.status.slice(0, 4) }}
                </UBadge>
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ entry.name }}</span>
                  <span class="block truncate text-xs text-muted">
                    {{ entry.test.filePath || entry.test.titlePath.join(' › ') || entry.source }}
                    <template v-if="platformLabel(entry)"> · {{ platformLabel(entry) }}</template>
                  </span>
                </span>
              </button>
            </template>
          </nav>

          <section v-if="current" class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="text-lg font-semibold">{{ current.name }}</h3>
              <UBadge :color="statusColor(current.status)" variant="subtle">{{ current.status }}</UBadge>
              <span class="text-sm text-muted">
                diff {{ percent(current.comparison.diffRatio) }}
                <template v-if="current.comparison.maxDiffRatio !== undefined"> · max {{ percent(current.comparison.maxDiffRatio) }}</template>
                <template v-if="current.comparison.colorThreshold !== undefined"> · color tolerance {{ current.comparison.colorThreshold }} ({{ current.comparison.colorMetric }})</template>
                <template v-if="current.viewport"> · {{ current.viewport.width }}×{{ current.viewport.height }}</template>
                <template v-if="platformLabel(current)"> · {{ platformLabel(current) }}</template>
              </span>
            </div>
            <p v-if="current.test.titlePath.length || current.test.filePath" class="text-sm text-muted">
              {{ current.test.titlePath.join(' › ') }}
              <template v-if="current.test.filePath"> <code class="break-all">{{ current.test.filePath }}</code></template>
              <template v-if="current.test.retry > 0"> · attempt {{ current.test.retry + 1 }}</template>
            </p>
            <p v-if="current.message" class="text-sm">{{ current.message }}</p>

            <div v-if="current.urls.baseline && current.urls.actual" class="space-y-2">
              <div class="relative inline-block max-w-full overflow-hidden rounded border border-default bg-[repeating-conic-gradient(#8882_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                <img :src="current.urls.baseline" alt="Baseline" class="block max-w-full" />
                <img
                  :src="current.urls.actual"
                  alt="Actual"
                  class="absolute inset-0 block max-w-full"
                  :style="{ clipPath: `inset(0 0 0 ${slider}%)` }"
                />
                <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" :style="{ left: `${slider}%` }" />
              </div>
              <div class="flex items-center gap-3 text-xs text-muted">
                <span>baseline</span>
                <input v-model.number="slider" type="range" min="0" max="100" class="min-w-0 flex-1 accent-primary sm:max-w-64" aria-label="Compare baseline and actual" />
                <span>actual</span>
              </div>
            </div>
            <div v-else class="flex flex-wrap gap-4">
              <figure v-if="current.urls.baseline">
                <img :src="current.urls.baseline" alt="Baseline" class="max-h-96 max-w-full rounded border border-default" />
                <figcaption class="mt-1 text-xs text-muted">baseline</figcaption>
              </figure>
              <figure v-if="current.urls.actual">
                <img :src="current.urls.actual" alt="Actual" class="max-h-96 max-w-full rounded border border-default" />
                <figcaption class="mt-1 text-xs text-muted">actual</figcaption>
              </figure>
              <p v-if="!current.urls.baseline && !current.urls.actual" class="text-sm text-muted">
                No image files for this entry among what was dropped
                (<code class="break-all">{{ current.images.baseline.path }}</code>).
              </p>
            </div>
            <figure v-if="current.urls.diff">
              <img :src="current.urls.diff" alt="Diff" class="max-h-96 max-w-full rounded border border-default" />
              <figcaption class="mt-1 break-all text-xs text-muted">diff · {{ current.images.diff.path }}</figcaption>
            </figure>
          </section>
        </div>
      </template>
    </div>
    <template #fallback>
      <div class="not-prose my-6 rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted">
        The viewer runs in your browser; enable JavaScript to use it.
      </div>
    </template>
  </ClientOnly>
</template>
