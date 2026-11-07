<script setup lang="ts">
// The online image diff tool. A page of its own instead of a content page:
// the docs layout leaves about 700px for the content, and the tool wants
// the width to put the images and the results side by side.
definePageMeta({ layout: 'default' });

const title = 'Online image diff';
const description =
  'Compare two images with exact pixels, pixelmatch, Resemble.js, SSIM and a perceptual hash, side by side. Everything runs in your browser: nothing is uploaded.';
useSeo({ title, description, type: 'website' });
defineOgImage('Docs', { headline: 'Tools', title, description });
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <header class="mb-4 space-y-1">
      <h1
        class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl"
      >
        Online image diff
      </h1>
      <p class="max-w-3xl text-sm text-muted">
        Drop a baseline and an actual image and see what five comparison
        algorithms make of the difference.
        <strong class="font-medium text-default"
          >The images never leave your browser:</strong
        >
        decoding and every comparison run on your machine, in a Web Worker. Not
        sure which algorithm to trust?
        <NuxtLink
          to="/diff-algorithms"
          class="underline underline-offset-2 hover:text-highlighted"
        >
          Which diff algorithm is best for you?
        </NuxtLink>
      </p>
    </header>

    <ImageDiffTool />

    <section
      class="mt-10 grid max-w-5xl gap-6 text-sm sm:grid-cols-2"
      aria-label="About this tool"
    >
      <div class="space-y-2">
        <h2 class="font-semibold text-highlighted">Reading the results</h2>
        <p class="text-muted">
          Each row is one algorithm with its own headline figure: a share of
          differing pixels, a mismatch percentage, a mean structural similarity
          or a Hamming distance between two fingerprints. They are not
          comparable with each other, only with the same algorithm on another
          pair. Open an engine's options to change what it tolerates; the row
          runs again. Click a row to see its diff in the viewer.
        </p>
        <p class="text-muted">
          The
          <NuxtLink
            to="/diff-algorithms"
            class="underline underline-offset-2 hover:text-highlighted"
            >guide</NuxtLink
          >
          explains how the algorithms differ and shows each of them on the same
          example pairs with measured numbers.
        </p>
      </div>
      <div class="space-y-2">
        <h2 class="font-semibold text-highlighted">Privacy</h2>
        <p class="text-muted">
          Images you drop, paste or choose are decoded in your browser and
          nothing is sent anywhere: the page is static and has no server behind
          it. Images loaded from addresses are fetched by your browser directly
          from the server you name. The same stance as the
          <NuxtLink
            to="/privacy"
            class="underline underline-offset-2 hover:text-highlighted"
            >privacy page</NuxtLink
          >.
        </p>
      </div>
    </section>
  </UContainer>
</template>
