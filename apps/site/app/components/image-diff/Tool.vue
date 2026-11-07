<script setup lang="ts">
// The online image diff: two images in, every engine's verdict side by side.
// Everything runs in the browser; the engines live in a Web Worker
// (app/lib/image-diff) that is created when this component mounts, so no other
// page pays for them.
import type { Status } from './EngineRow.vue';
import { size } from '~/lib/image-diff/format';
import { infos } from '~/lib/image-diff/engines/infos';
import { presets, type Preset } from '~/lib/image-diff/presets';
import type {
  Dimensions,
  EngineResult,
  Options,
  Padding,
} from '~/lib/image-diff/types';
import { viewModes, type ViewMode } from '~/lib/image-diff/views';
import type { DiffWorker } from '~/lib/image-diff/worker-client';

// --- the two images -------------------------------------------------------

interface Slot {
  blob: Blob | null;
  url: string | null;
  name: string;
  dims: Dimensions | null;
}
const empty = (): Slot => ({ blob: null, url: null, name: '', dims: null });
const a = reactive<Slot>(empty());
const b = reactive<Slot>(empty());
const padding = ref<Padding>('magenta');
/** the padded copies the engines actually saw, when the sizes differ */
const padded = ref<(Dimensions & { aUrl: string; bUrl: string }) | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const preset = ref<string | null>(null);
const dragging = ref(false);

const release = (url: string | null) => url && URL.revokeObjectURL(url);
const fill = (slot: Slot, blob: Blob, name: string) => {
  release(slot.url);
  slot.blob = blob;
  slot.url = URL.createObjectURL(blob);
  slot.name = name;
  slot.dims = null;
};
const clear = (slot: Slot) => {
  release(slot.url);
  Object.assign(slot, empty());
};
const setAddress = (query: string) =>
  history.replaceState(null, '', `${location.pathname}${query}`);

/** files dropped or picked: two at once fill both slots, one fills the given slot */
const onFiles = (slot: Slot, files: File[]) => {
  preset.value = null;
  loadError.value = null;
  setAddress('');
  if (files.length >= 2) {
    fill(a, files[0]!, files[0]!.name);
    fill(b, files[1]!, files[1]!.name);
  } else {
    fill(slot, files[0]!, files[0]!.name);
  }
};
const nextSlot = () => (a.blob && !b.blob ? b : a);
const images = (files: File[] | FileList | undefined) =>
  [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
const onDragOver = (event: DragEvent) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  // without this the browser would open the dropped file instead
  event.preventDefault();
  dragging.value = true;
};
const onDragLeave = (event: DragEvent) => {
  if (!event.relatedTarget) dragging.value = false;
};
const onDrop = (event: DragEvent) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragging.value = false;
  const files = images(event.dataTransfer?.files);
  if (files.length) onFiles(nextSlot(), files);
};
const onPaste = (event: ClipboardEvent) => {
  if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;
  const files = images(event.clipboardData?.files);
  if (!files.length) return;
  event.preventDefault();
  onFiles(nextSlot(), files.slice(0, 1));
};
const swap = () => {
  const copy = { ...a };
  Object.assign(a, { ...b });
  Object.assign(b, copy);
};

// --- engines --------------------------------------------------------------

interface EngineState {
  enabled: boolean;
  options: Options;
  status: Status;
  result: EngineResult | null;
  diffUrl: string | null;
  error: string | null;
  /** bumps on every (re)run; a result from an older run is dropped */
  run: number;
}
const engines = reactive<Record<string, EngineState>>(
  Object.fromEntries(
    infos.map((info) => [
      info.id,
      {
        enabled: true,
        options: { ...info.defaults },
        status: 'idle',
        result: null,
        diffUrl: null,
        error: null,
        run: 0,
      } satisfies EngineState,
    ]),
  ),
);
const selected = ref('pixelmatch');
const mode = ref<ViewMode>('slider');
let worker: DiffWorker | null = null;
const workerReady = ref(false);
let unmounted = false;
/** the images in the worker; a run belongs to one generation */
let generation = 0;

const setResult = (state: EngineState, result: EngineResult | null) => {
  release(state.diffUrl);
  state.result = result;
  state.diffUrl = result?.diff ? URL.createObjectURL(result.diff) : null;
};

const runEngine = async (id: string) => {
  if (!worker) return;
  const state = engines[id]!;
  const run = ++state.run;
  const gen = generation;
  state.status = 'running';
  state.error = null;
  try {
    const result = await worker.run(id, { ...state.options });
    if (run !== state.run || gen !== generation) return;
    setResult(state, result);
    state.status = 'done';
  } catch (error) {
    if (run !== state.run || gen !== generation) return;
    setResult(state, null);
    state.status = 'error';
    state.error = error instanceof Error ? error.message : String(error);
  }
};

const runAll = async () => {
  const gen = generation;
  const ids = infos.map((i) => i.id).filter((id) => engines[id]!.enabled);
  for (const id of ids) engines[id]!.status = 'queued';
  for (const id of ids) {
    if (gen !== generation) return;
    await runEngine(id);
  }
};

const compare = async () => {
  if (!a.blob || !b.blob || !worker) return;
  const gen = ++generation;
  loading.value = true;
  loadError.value = null;
  for (const state of Object.values(engines)) {
    setResult(state, null);
    state.status = state.enabled ? 'queued' : 'idle';
    state.error = null;
  }
  if (padded.value) {
    release(padded.value.aUrl);
    release(padded.value.bUrl);
    padded.value = null;
  }
  try {
    const loaded = await worker.load(a.blob, b.blob, padding.value);
    if (gen !== generation) return;
    a.dims = loaded.a;
    b.dims = loaded.b;
    padded.value = loaded.padded
      ? {
          width: loaded.padded.width,
          height: loaded.padded.height,
          aUrl: URL.createObjectURL(loaded.padded.a),
          bUrl: URL.createObjectURL(loaded.padded.b),
        }
      : null;
    loading.value = false;
    await runAll();
  } catch (error) {
    // a newer compare started: its state is not ours to touch
    if (gen !== generation) return;
    loading.value = false;
    loadError.value = error instanceof Error ? error.message : String(error);
    for (const state of Object.values(engines)) state.status = 'idle';
  }
};

// a new pair, or a new padding, compares again
watch([() => a.blob, () => b.blob, padding, workerReady], compare);

// clearing a slot drops the numbers, thumbnails and padded copies of the old pair
watch([() => a.blob, () => b.blob], ([blobA, blobB]) => {
  if (blobA && blobB) return;
  generation++;
  loading.value = false;
  for (const state of Object.values(engines)) {
    setResult(state, null);
    state.status = 'idle';
    state.error = null;
  }
  if (padded.value) {
    release(padded.value.aUrl);
    release(padded.value.bUrl);
    padded.value = null;
  }
  a.dims = null;
  b.dims = null;
});

// a changed setting reruns that engine only (after a short pause)
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
for (const info of infos) {
  watch(
    () => ({ ...engines[info.id]!.options }),
    () => {
      if (!a.dims || !b.dims || !engines[info.id]!.enabled) return;
      clearTimeout(timers[info.id]);
      timers[info.id] = setTimeout(() => runEngine(info.id), 250);
    },
  );
  watch(
    () => engines[info.id]!.enabled,
    (enabled) => {
      const state = engines[info.id]!;
      if (enabled && a.dims && b.dims && !state.result) runEngine(info.id);
      if (!enabled) {
        state.run++;
        state.status = 'idle';
        setResult(state, null);
      }
    },
  );
}
const resetOptions = (id: string) => {
  const info = infos.find((i) => i.id === id);
  if (info) engines[id]!.options = { ...info.defaults };
};

// --- addresses: presets and ?a=&b= ------------------------------------------

const urlA = ref('');
const urlB = ref('');
const fetching = ref(false);
/** addresses from the page link that point to a third party: loaded only after the reader agrees */
const waiting = ref<{ a: string; b: string } | null>(null);
const sameOrigin = (address: string) => {
  try {
    return new URL(address, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

const fetchImage = async (url: string) => {
  try {
    // no cookies or credentials: the address alone decides what comes back
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    return await response.blob();
  } catch (error) {
    throw new Error(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}. The server must allow cross-origin reads (CORS) for the browser to hand the image over.`,
      { cause: error },
    );
  }
};
const basename = (url: string) =>
  decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() || url);

/** the two addresses are fetched by this browser; the address bar then carries them */
const loadAddresses = async (from: string, to: string) => {
  fetching.value = true;
  loadError.value = null;
  try {
    const [blobA, blobB] = await Promise.all([
      fetchImage(from),
      fetchImage(to),
    ]);
    fill(a, blobA, basename(from));
    fill(b, blobB, basename(to));
    urlA.value = from;
    urlB.value = to;
    setAddress(`?${new URLSearchParams({ a: from, b: to }).toString()}`);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    fetching.value = false;
  }
};
const pickPreset = async (item: Preset) => {
  await loadAddresses(item.a, item.b);
  preset.value = loadError.value ? null : item.id;
};
const submitAddresses = () => {
  preset.value = null;
  return loadAddresses(urlA.value.trim(), urlB.value.trim());
};

const route = useRoute();

const loadWaiting = async () => {
  if (!waiting.value) return;
  const { a: from, b: to } = waiting.value;
  waiting.value = null;
  await loadAddresses(from, to);
};

onMounted(async () => {
  // listeners first: a file dropped while the worker code loads is kept and compared once it is ready
  addEventListener('paste', onPaste);
  addEventListener('dragover', onDragOver);
  addEventListener('dragleave', onDragLeave);
  addEventListener('drop', onDrop);
  // the router's query: location.search can be empty for a moment while Nuxt hydrates
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
  const from = String(first(route.query.a) ?? '');
  const to = String(first(route.query.b) ?? '');
  if (from && to) {
    urlA.value = from;
    urlB.value = to;
    preset.value = presets.find((p) => p.a === from && p.b === to)?.id ?? null;
    // this site's own addresses (the examples) load at once; a third party only after the notice
    if (sameOrigin(from) && sameOrigin(to)) await loadAddresses(from, to);
    else waiting.value = { a: from, b: to };
  }
  const { DiffWorker } = await import('~/lib/image-diff/worker-client');
  if (unmounted) return;
  worker = new DiffWorker();
  workerReady.value = true;
});
onBeforeUnmount(() => {
  unmounted = true;
  removeEventListener('paste', onPaste);
  removeEventListener('dragover', onDragOver);
  removeEventListener('dragleave', onDragLeave);
  removeEventListener('drop', onDrop);
  worker?.terminate();
  for (const state of Object.values(engines)) release(state.diffUrl);
  for (const slot of [a, b]) release(slot.url);
  if (padded.value) {
    release(padded.value.aUrl);
    release(padded.value.bUrl);
  }
});

const ready = computed(() => Boolean(a.blob && b.blob));
const viewA = computed(() => padded.value?.aUrl ?? a.url);
const viewB = computed(() => padded.value?.bUrl ?? b.url);
const frame = computed(() => padded.value ?? a.dims ?? { width: 1, height: 1 });
const current = computed(() => engines[selected.value]!);
const currentInfo = computed(() => infos.find((i) => i.id === selected.value));
const finished = computed(
  () =>
    Object.values(engines).filter((e) => e.enabled && e.status === 'done')
      .length,
);
const presetHint = computed(
  () => presets.find((p) => p.id === preset.value)?.hint,
);
</script>

<template>
  <ClientOnly>
    <div class="not-prose space-y-3">
      <!-- examples, size handling and addresses: one strip -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div
          role="group"
          aria-label="Examples"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span class="text-muted">Examples</span>
          <UButton
            v-for="item in presets"
            :key="item.id"
            size="xs"
            color="neutral"
            :variant="preset === item.id ? 'solid' : 'subtle'"
            :aria-pressed="preset === item.id"
            :disabled="fetching"
            @click="pickPreset(item)"
          >
            {{ item.label }}
          </UButton>
        </div>
        <label v-if="padded" class="ml-auto flex items-center gap-1.5 text-xs">
          Pad the smaller image with
          <select
            v-model="padding"
            class="rounded border border-default bg-default px-1.5 py-0.5"
          >
            <option value="magenta">magenta</option>
            <option value="transparent">transparent</option>
          </select>
        </label>
      </div>
      <p v-if="presetHint" class="text-xs text-muted">{{ presetHint }}</p>

      <details class="rounded-lg border border-default px-3 py-2 text-xs">
        <summary
          class="cursor-pointer font-medium text-muted hover:text-highlighted"
        >
          Compare two images from addresses
        </summary>
        <form class="mt-2 space-y-2" @submit.prevent="submitAddresses">
          <div class="grid gap-2 sm:grid-cols-2">
            <label class="block">
              <span class="text-muted">Baseline address</span>
              <input
                v-model="urlA"
                type="url"
                required
                placeholder="https://example.com/baseline.png"
                class="mt-0.5 block w-full rounded border border-default bg-default px-2 py-1"
              />
            </label>
            <label class="block">
              <span class="text-muted">Actual address</span>
              <input
                v-model="urlB"
                type="url"
                required
                placeholder="https://example.com/actual.png"
                class="mt-0.5 block w-full rounded border border-default bg-default px-2 py-1"
              />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              type="submit"
              size="xs"
              color="neutral"
              variant="subtle"
              :loading="fetching"
            >
              Fetch and compare
            </UButton>
            <span class="text-muted">
              Your browser fetches these addresses itself, straight from the
              server behind them (that server sees your request and your IP
              address); this site never sees the images. The server must allow
              cross-origin reads (CORS). The page address then reads
              <code class="font-mono">?a=&amp;b=</code>, so you can share the
              link: whoever opens it fetches the same images.
            </span>
          </div>
        </form>
      </details>

      <div
        v-if="waiting"
        class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        role="region"
        aria-label="Images from a link"
      >
        <p>
          This link asks your browser to fetch two images from other websites:
        </p>
        <ul class="my-1 list-inside list-disc break-all font-mono text-xs">
          <li>{{ waiting.a }}</li>
          <li>{{ waiting.b }}</li>
        </ul>
        <p class="text-xs text-muted">
          Those servers will see your request and your IP address, and must
          allow cross-origin reads (CORS). This site never sees the images.
        </p>
        <UButton
          class="mt-2"
          size="xs"
          color="neutral"
          :loading="fetching"
          @click="loadWaiting"
        >
          Load these images
        </UButton>
      </div>

      <p
        v-if="loadError"
        class="rounded-md bg-error/10 px-3 py-2 text-sm text-error"
        role="alert"
      >
        {{ loadError }}
      </p>

      <div
        class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
      >
        <!-- the images -->
        <section aria-label="Images" class="min-w-0 space-y-2">
          <div
            class="grid gap-2"
            :class="
              ready
                ? 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center'
                : 'sm:grid-cols-2'
            "
          >
            <ImageDiffSlot
              label="Baseline"
              :url="a.url"
              :name="a.name"
              :dims="a.dims"
              @files="(files) => onFiles(a, files)"
              @clear="clear(a)"
            />
            <UButton
              v-if="ready"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left-right"
              aria-label="Swap baseline and actual"
              @click="swap"
            />
            <ImageDiffSlot
              label="Actual"
              :url="b.url"
              :name="b.name"
              :dims="b.dims"
              @files="(files) => onFiles(b, files)"
              @clear="clear(b)"
            />
          </div>

          <template v-if="ready">
            <div
              v-if="padded"
              class="rounded border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs"
            >
              <strong class="font-medium">Different sizes:</strong>
              baseline {{ size(a.dims) }}, actual {{ size(b.dims) }}. Both were
              padded to {{ size(padded) }}, so the padding counts as a
              difference in most engines.
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="View"
                class="inline-flex rounded-md bg-elevated p-0.5"
              >
                <button
                  v-for="view in viewModes"
                  :key="view.id"
                  type="button"
                  class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium"
                  :class="
                    mode === view.id
                      ? 'bg-default text-highlighted shadow-sm'
                      : 'text-muted hover:text-highlighted'
                  "
                  :aria-pressed="mode === view.id"
                  @click="mode = view.id"
                >
                  <UIcon
                    :name="view.icon"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ view.label }}
                </button>
              </div>
              <span
                v-if="mode === 'diff' || mode === 'side-by-side'"
                class="text-xs text-muted"
              >
                diff of
                <span class="font-medium text-default">{{
                  currentInfo?.name
                }}</span>
              </span>
            </div>

            <ImageDiffViewer
              v-if="viewA && viewB"
              :baseline="viewA"
              :actual="viewB"
              :diff="current.diffUrl"
              :legend="current.result?.legend"
              :width="frame.width"
              :height="frame.height"
              :mode="mode"
            />
            <div v-if="loading" class="text-xs text-muted" role="status">
              Decoding the images
            </div>
          </template>
          <p v-else class="text-xs text-muted">
            Drop two images anywhere on this page, or paste one from the
            clipboard.
            <template v-if="dragging"> Release to load.</template>
          </p>
        </section>

        <!-- one row per engine -->
        <section aria-label="Results" class="min-w-0 space-y-2">
          <ul
            class="divide-y divide-default overflow-hidden rounded-lg border border-default"
          >
            <ImageDiffEngineRow
              v-for="info in infos"
              :key="info.id"
              v-model:enabled="engines[info.id]!.enabled"
              v-model:options="engines[info.id]!.options"
              :info="info"
              :status="engines[info.id]!.status"
              :result="engines[info.id]!.result"
              :diff-url="engines[info.id]!.diffUrl"
              :error="engines[info.id]!.error"
              :selected="selected === info.id"
              @select="selected = info.id"
              @reset="resetOptions(info.id)"
            />
          </ul>
          <p class="text-xs text-muted" role="status">
            <template v-if="ready">
              {{ finished }} of
              {{ infos.filter((i) => engines[i.id]!.enabled).length }}
              engines finished.
            </template>
            The numbers are not comparable across engines: each defines a
            difference in its own way.
          </p>
        </section>
      </div>
    </div>
    <template #fallback>
      <div
        class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted"
      >
        The image diff runs in your browser; enable JavaScript to use it.
      </div>
    </template>
  </ClientOnly>
</template>
