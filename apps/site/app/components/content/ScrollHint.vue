<script setup lang="ts">
// A bouncing chevron pinned to the bottom of the first screen; it tells
// visitors the page scrolls and fades out once they do.
const scrolled = ref(false);
const update = () => (scrolled.value = window.scrollY > 40);
onMounted(() => {
  update();
  window.addEventListener('scroll', update, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', update));

function next() {
  window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
}
</script>

<template>
  <UButton
    type="button"
    color="neutral"
    size="xl"
    variant="outline"
    aria-label="Scroll down"
    :aria-hidden="scrolled"
    :tabindex="scrolled ? -1 : 0"
    class="fixed bottom-6 left-1/2 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full motion-safe:animate-bounce"
    :class="scrolled ? 'pointer-events-none opacity-0' : 'opacity-100'"
    @click="next"
  >
    <UIcon name="i-lucide-chevron-down" class="size-5" />
  </UButton>
</template>
