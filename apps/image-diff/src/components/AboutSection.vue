<script setup lang="ts">
import type { EngineInfo } from '../types';

defineProps<{ infos: EngineInfo[] }>();

const nativeOnly = [
  {
    name: 'odiff',
    url: 'https://github.com/dmtrKovalenko/odiff',
    why: 'written in OCaml and shipped as a native binary (and an N-API binding) for speed; there is no browser build.',
  },
  {
    name: 'looks-same',
    url: 'https://github.com/gemini-testing/looks-same',
    why: 'a Node library that decodes PNGs with Node streams and the native sharp bindings; it has no browser build.',
  },
];
</script>

<template>
  <section id="about" aria-labelledby="about-title" class="space-y-6">
    <div class="space-y-2">
      <h2 id="about-title" class="text-xl font-semibold">About the engines</h2>
      <p class="max-w-3xl text-sm text-muted">
        Every engine runs in your browser on the same two images. The numbers
        are not comparable across engines: each defines a "difference" its own
        way. The longer story is in
        <a
          href="https://visual-regression.dev/learn/how-image-diffing-works"
          class="underline underline-offset-2 hover:text-fg"
          >How image diffing works</a
        >
        and the
        <a
          href="https://visual-regression.dev/deep-dives/diff-engines"
          class="underline underline-offset-2 hover:text-fg"
          >diff engines deep dive</a
        >; recipes for thresholds, masks and flaky screenshots are in the
        <a
          href="https://visual-regression.dev/cookbook"
          class="underline underline-offset-2 hover:text-fg"
          >cookbook</a
        >.
      </p>
    </div>

    <dl class="grid gap-4 sm:grid-cols-2">
      <div
        v-for="info in infos"
        :key="info.id"
        class="rounded-lg border border-border bg-surface p-4 text-sm"
      >
        <dt class="flex flex-wrap items-baseline gap-x-2 font-semibold">
          {{ info.name }}
          <a
            v-if="info.package"
            :href="info.package.url"
            target="_blank"
            rel="noopener"
            class="font-mono text-xs font-normal text-muted underline-offset-2 hover:underline"
            >{{ info.package.name }}</a
          >
        </dt>
        <dd class="mt-1 text-muted">{{ info.summary }}</dd>
        <dd class="mt-2 text-xs text-muted">
          <span class="font-medium text-fg">Different sizes:</span>
          {{ info.sizeMismatch }}
        </dd>
      </div>
    </dl>

    <div class="space-y-2 text-sm">
      <h3 class="font-semibold">Not here: the native engines</h3>
      <ul class="space-y-1 text-muted">
        <li v-for="tool in nativeOnly" :key="tool.name">
          <a
            :href="tool.url"
            target="_blank"
            rel="noopener"
            class="font-medium text-fg underline-offset-2 hover:underline"
            >{{ tool.name }}</a
          >: {{ tool.why }}
        </li>
      </ul>
    </div>

    <div class="space-y-2 text-sm">
      <h3 class="font-semibold">Privacy</h3>
      <p class="max-w-3xl text-muted">
        The images you drop, paste or point to never leave your browser: the
        page is static, decoding and every comparison happen in a Web Worker on
        your machine, and nothing is sent anywhere. Images given as
        <code class="font-mono text-xs">?a=&amp;b=</code> are fetched by your
        browser directly from the address you name; the server there must allow
        cross-origin reads (CORS), otherwise the browser refuses to hand the
        pixels over. The same stance as the main site's
        <a
          href="https://visual-regression.dev/privacy"
          class="underline underline-offset-2 hover:text-fg"
          >privacy page</a
        >.
      </p>
    </div>
  </section>
</template>
