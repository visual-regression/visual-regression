<script setup lang="ts">
// Same shapes as the site's brand mark (apps/site/public/brand/mark.svg)
defineProps<{ size?: number }>();
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    :width="size ?? 28"
    :height="size ?? 28"
    role="img"
    aria-label="visual-regression.dev"
  >
    <rect x="6" y="6" width="36" height="36" rx="9" class="fill-muted" />
    <rect x="22" y="22" width="36" height="36" rx="9" class="fill-fg" />
    <path d="M22 22h20v11a9 9 0 0 1-9 9H22z" class="fill-accent" />
  </svg>
</template>
