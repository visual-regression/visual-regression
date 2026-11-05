<template>
  <footer class="mt-16 border-t border-border">
    <div
      class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6"
    >
      <span>
        © {{ new Date().getFullYear() }}
        <a
          href="https://visual-regression.dev"
          class="underline underline-offset-2 hover:text-fg"
          >visual-regression.dev</a
        >
        · maintained by the
        <a
          href="https://pixsame.com"
          target="_blank"
          rel="noopener"
          class="underline underline-offset-2 hover:text-fg"
          >pixsame</a
        >
        team
      </span>
      <span class="flex flex-wrap gap-x-4">
        <a
          href="https://visual-regression.dev/privacy"
          class="underline underline-offset-2 hover:text-fg"
          >Privacy</a
        >
        <a
          href="https://github.com/visual-regression/visual-regression/tree/main/apps/image-diff"
          target="_blank"
          rel="noopener"
          class="underline underline-offset-2 hover:text-fg"
          >Source on GitHub</a
        >
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener"
          class="underline underline-offset-2 hover:text-fg"
          >Content under CC BY 4.0</a
        >
      </span>
    </div>
  </footer>
</template>
