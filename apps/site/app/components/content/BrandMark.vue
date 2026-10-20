<script setup lang="ts">
// The brand mark, inline so the colors follow the color mode: a baseline
// screenshot, the new screenshot laid over it, and the emerald overlap where
// the two agree. Same shapes as `public/brand/mark.svg` (the favicon).
// Decorative by default; pass `title` to make it an accessible image.
defineProps<{ title?: string }>();
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'"
  >
    <title v-if="title">{{ title }}</title>
    <rect x="6" y="6" width="36" height="36" rx="9" class="fill-zinc-400 dark:fill-zinc-500" />
    <rect x="22" y="22" width="36" height="36" rx="9" class="fill-zinc-900 dark:fill-zinc-50" />
    <path d="M22 22h20v11a9 9 0 0 1-9 9H22z" class="fill-emerald-500 dark:fill-emerald-400" />
  </svg>
</template>
