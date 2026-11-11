<script setup lang="ts">
const route = useRoute();

const items = computed(() => [
  {
    label: 'Learn',
    to: '/learn/what-is-visual-regression-testing',
    active: route.path.startsWith('/learn'),
  },
  {
    label: 'Diff algorithms',
    to: '/diff-algorithms',
    active: route.path.startsWith('/diff-algorithms'),
  },
  {
    label: 'Manifest',
    to: '/manifest',
    active: route.path.startsWith('/manifest'),
  },
  {
    label: 'Comparison',
    to: '/compare',
    active: route.path.startsWith('/compare'),
  },
  {
    label: 'Viewer',
    to: '/viewer',
    active: route.path.startsWith('/viewer'),
  },
  {
    label: 'Image diff',
    to: '/image-diff',
    active: route.path.startsWith('/image-diff'),
  },
]);
</script>

<template>
  <div class="flex w-full items-center justify-between gap-4">
    <UNavigationMenu :items="items" variant="link" />
    <UContentSearchButton
      :collapsed="false"
      variant="soft"
      class="flex-grow"
      :ui="{
        leadingIcon: 'size-4 mx-0.5',
      }"
    />
  </div>
</template>
