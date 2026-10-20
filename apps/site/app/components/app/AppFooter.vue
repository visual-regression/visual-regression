<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content';

const appConfig = useAppConfig();
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation');

const childrenOf = (path: string) =>
  (navigation?.value.find((item) => item.path === path)?.children ?? []).map(
    (child) => ({ label: child.title, to: child.path }),
  );

const columns = computed(() => [
  { label: 'Learn', children: childrenOf('/learn') },
  { label: 'Manifest standard', children: childrenOf('/manifest') },
  {
    label: 'Tools',
    children: [
      { label: 'Compare the tools', to: '/compare' },
      { label: 'Viewer', to: '/viewer' },
    ],
  },
  {
    label: 'Project',
    children: [
      {
        label: 'Source on GitHub',
        to: appConfig.github?.url,
        target: '_blank',
      },
      { label: 'pixsame', to: 'https://pixsame.com', target: '_blank' },
      { label: 'Privacy', to: '/privacy' },
    ],
  },
]);
</script>

<template>
  <UFooter>
    <template #top>
      <UContainer>
        <UFooterColumns :columns="columns" />
      </UContainer>
    </template>

    <template #left>
      <AppFooterLeft />
    </template>

    <template #right>
      <AppFooterRight />
    </template>
  </UFooter>
</template>
