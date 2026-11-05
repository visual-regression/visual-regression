<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import AboutSection from './components/AboutSection.vue';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import DropZone from './components/DropZone.vue';
import EngineCard, { type Status } from './components/EngineCard.vue';
import ExamplesRow from './components/ExamplesRow.vue';
import ViewToggle from './components/ViewToggle.vue';
import { infos } from './engines';
import { exampleImage, loadExamples, type Example } from './lib/examples';
import { size } from './lib/format';
import type { ViewMode } from './lib/views';
import { DiffWorker } from './lib/worker-client';
import type { Dimensions, EngineResult, Options, Padding } from './types';

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
const example = ref<string | null>(null);
const examples = ref<Example[]>([]);

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

/** files dropped or picked on one zone; two at once fill both */
const onFiles = (slot: Slot, files: File[]) => {
  example.value = null;
  history.replaceState(null, '', location.pathname);
  if (files.length >= 2) {
    fill(a, files[0], files[0].name);
    fill(b, files[1], files[1].name);
  } else {
    fill(slot, files[0], files[0].name);
  }
};
const onPaste = (event: ClipboardEvent) => {
  const file = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .find((f): f is File => f !== null);
  if (!file) return;
  event.preventDefault();
  onFiles(a.blob && !b.blob ? b : a, [file]);
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
const engineName = (id: string) => infos.find((i) => i.id === id)?.name ?? id;
const mode = ref<ViewMode>('side-by-side');
const worker = new DiffWorker();
/** the images in the worker; a run belongs to one generation */
let generation = 0;

const setResult = (state: EngineState, result: EngineResult | null) => {
  release(state.diffUrl);
  state.result = result;
  state.diffUrl = result?.diff ? URL.createObjectURL(result.diff) : null;
};

const runEngine = async (id: string) => {
  const state = engines[id];
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
  const ids = infos.map((i) => i.id).filter((id) => engines[id].enabled);
  for (const id of ids) engines[id].status = 'queued';
  for (const id of ids) {
    if (gen !== generation) return;
    await runEngine(id);
  }
};

const compare = async () => {
  if (!a.blob || !b.blob) return;
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
watch([() => a.blob, () => b.blob, padding], compare);

// a changed setting reruns that engine only (after a short pause)
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
for (const info of infos) {
  watch(
    () => ({ ...engines[info.id].options }),
    () => {
      if (!a.dims || !b.dims || !engines[info.id].enabled) return;
      clearTimeout(timers[info.id]);
      timers[info.id] = setTimeout(() => runEngine(info.id), 250);
    },
  );
  watch(
    () => engines[info.id].enabled,
    (enabled) => {
      const state = engines[info.id];
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
  if (info) engines[id].options = { ...info.defaults };
};

// --- examples and URL parameters -------------------------------------------

const pickExample = async (id: string) => {
  try {
    const [baseline, actual] = await Promise.all([
      exampleImage(id, 'baseline'),
      exampleImage(id, 'actual'),
    ]);
    example.value = id;
    history.replaceState(null, '', `?example=${id}`);
    fill(a, baseline, `${id}/baseline.png`);
    fill(b, actual, `${id}/actual.png`);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  }
};

const fetchImage = async (url: string) => {
  try {
    const response = await fetch(url, { mode: 'cors' });
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

onMounted(async () => {
  addEventListener('paste', onPaste);
  examples.value = await loadExamples();
  const params = new URLSearchParams(location.search);
  const urlA = params.get('a');
  const urlB = params.get('b');
  const wanted = params.get('example');
  if (urlA && urlB) {
    try {
      const [blobA, blobB] = await Promise.all([
        fetchImage(urlA),
        fetchImage(urlB),
      ]);
      fill(a, blobA, urlA);
      fill(b, blobB, urlB);
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error);
    }
  } else if (wanted && examples.value.some((e) => e.id === wanted)) {
    await pickExample(wanted);
  }
});
onBeforeUnmount(() => removeEventListener('paste', onPaste));

const ready = computed(() => Boolean(a.blob && b.blob));
const viewA = computed(() => padded.value?.aUrl ?? a.url);
const viewB = computed(() => padded.value?.bUrl ?? b.url);
</script>

<template>
  <div
    class="flex min-h-screen flex-col"
    @dragover.prevent
    @drop.prevent="
      (e: DragEvent) => {
        const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length) onFiles(a.blob && !b.blob ? b : a, files);
      }
    "
  >
    <AppHeader />

    <main class="mx-auto w-full max-w-7xl flex-1 space-y-10 px-4 py-8 sm:px-6">
      <section class="space-y-3">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
          Compare two images, five ways.
        </h1>
        <p class="max-w-3xl text-muted">
          Drop a baseline and an actual screenshot and see what pixelmatch,
          Resemble.js, SSIM, an exact comparison and a perceptual hash make of
          the difference, with every setting at hand. Everything runs in your
          browser:
          <strong class="font-medium text-fg">nothing is uploaded.</strong>
        </p>
      </section>

      <section aria-label="Images" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <DropZone
            label="Baseline"
            :url="a.url"
            :name="a.name"
            :dims="a.dims"
            @files="(files) => onFiles(a, files)"
            @clear="clear(a)"
          />
          <button
            type="button"
            class="btn justify-self-center"
            :disabled="!a.blob && !b.blob"
            aria-label="Swap baseline and actual"
            title="Swap"
            @click="swap"
          >
            <span aria-hidden="true">⇄</span>
            <span class="md:sr-only">Swap</span>
          </button>
          <DropZone
            label="Actual"
            :url="b.url"
            :name="b.name"
            :dims="b.dims"
            @files="(files) => onFiles(b, files)"
            @clear="clear(b)"
          />
        </div>
        <p class="text-xs text-muted">
          Drop or pick two files at once to fill both. Paste an image from the
          clipboard to fill the next empty slot. Or open the page as
          <code class="font-mono">?a=&lt;url&gt;&amp;b=&lt;url&gt;</code>: the
          images are fetched by your browser, so the server must allow
          cross-origin reads (CORS).
        </p>
        <p
          v-if="loadError"
          class="rounded-md bg-error/10 px-3 py-2 text-sm text-error"
        >
          {{ loadError }}
        </p>
      </section>

      <ExamplesRow
        v-if="examples.length"
        :examples="examples"
        :current="example"
        :engine-name="engineName"
        @pick="pickExample"
      />

      <section v-if="ready" aria-label="Results" class="space-y-4">
        <div
          v-if="padded"
          class="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <p>
            <strong class="font-medium">The sizes differ:</strong> baseline
            {{ size(a.dims) }}, actual {{ size(b.dims) }}. Both were padded to
            {{ size(padded) }} before comparing, so the padding shows up as a
            difference. pixelmatch and SSIM refuse images of different sizes on
            their own; Resemble.js compares them on the larger canvas (or scales
            with scaleToSameSize); the exact comparison and the hash have no
            opinion.
          </p>
          <label class="flex items-center gap-2">
            <span>Pad with</span>
            <select v-model="padding" class="field w-auto">
              <option value="magenta">magenta</option>
              <option value="transparent">transparent</option>
            </select>
          </label>
        </div>

        <div
          class="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-y border-border bg-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
        >
          <ViewToggle v-model="mode" />
          <fieldset class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <legend class="sr-only">Engines</legend>
            <label
              v-for="info in infos"
              :key="info.id"
              class="flex items-center gap-1.5"
            >
              <input
                v-model="engines[info.id].enabled"
                type="checkbox"
                class="accent-accent"
              />
              {{ info.name }}
            </label>
          </fieldset>
          <button
            type="button"
            class="btn ml-auto"
            :disabled="loading"
            @click="compare"
          >
            Run again
          </button>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <template v-for="info in infos" :key="info.id">
            <EngineCard
              v-if="engines[info.id].enabled"
              v-model:options="engines[info.id].options"
              :info="info"
              :status="engines[info.id].status"
              :result="engines[info.id].result"
              :diff-url="engines[info.id].diffUrl"
              :error="engines[info.id].error"
              :baseline="viewA"
              :actual="viewB"
              :mode="mode"
              @reset="resetOptions(info.id)"
            />
          </template>
        </div>
      </section>

      <AboutSection :infos="infos" />
    </main>

    <AppFooter />
  </div>
</template>
