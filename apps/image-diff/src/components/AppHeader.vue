<template>
  <header
    class="border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60"
  >
    <div
      class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6"
    >
      <a href="/" class="flex items-center gap-2.5 font-semibold">
        <BrandMark />
        <span>Image diff</span>
      </a>
      <span class="hidden text-sm text-muted sm:inline">
        a tool from
        <a
          href="https://visual-regression.dev"
          class="underline underline-offset-2 hover:text-fg"
          >visual-regression.dev</a
        >
      </span>
      <nav class="ml-auto flex items-center gap-4 text-sm">
        <a href="#about" class="hover:underline">About the engines</a>
        <a
          href="https://visual-regression.dev/learn/how-image-diffing-works"
          class="hidden hover:underline sm:inline"
          >How image diffing works</a
        >
        <a
          href="https://github.com/visual-regression/visual-regression"
          class="hover:underline"
          aria-label="Source on GitHub"
          >GitHub</a
        >
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import BrandMark from './BrandMark.vue';
</script>
