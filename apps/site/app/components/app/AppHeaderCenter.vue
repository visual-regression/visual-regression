<script setup lang="ts">
const route = useRoute();

const items = computed(() => [
  {
    label: 'Learn',
    to: '/learn/what-is-visual-regression-testing',
    active: route.path.startsWith('/learn'),
  },
  {
    label: 'Manifest',
    to: '/manifest',
    active: route.path.startsWith('/manifest'),
  },
  {
    label: 'Tools',
    to: '/compare',
    active: route.path.startsWith('/compare'),
  },
  {
    label: 'Viewer',
    to: '/viewer',
    active: route.path.startsWith('/viewer'),
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
