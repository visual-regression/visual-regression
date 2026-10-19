<script setup lang="ts">
const appConfig = useAppConfig();
const { forced: forcedColorMode } = useDocusColorMode();
</script>

<template>
  <UColorModeButton v-if="!forcedColorMode" />
  <UButton
    v-if="appConfig.github?.url"
    size="sm"
    color="neutral"
    variant="ghost"
    icon="i-simple-icons-github"
    :to="appConfig.github.url"
    target="_blank"
    aria-label="GitHub repository"
  />
</template>
