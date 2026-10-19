export default defineAppConfig({
  docus: {
    locale: 'en',
  },
  seo: {
    title: 'visual-regression.dev',
    description:
      'Learn visual regression testing, compare the tools, and share one run manifest between them.',
  },
  header: {
    title: 'visual-regression.dev',
    logo: false,
  },
  // Narrow-screen fixes (320px). Classes merge into the Nuxt UI defaults.
  ui: {
    prose: {
      // Inline code is `inline-block`, so long paths such as
      // `build/test-results/roborazzi/<variant>/results-summary.json` could
      // not wrap and pushed the page wider than the viewport.
      code: { base: 'max-w-full wrap-anywhere' },
    },
    // "Previous / next chapter" cards: icon and label share one line, and the
    // next card uses the primary colour. The label comes from the slot in
    // app/pages/[[lang]]/[...slug].vue.
    contentSurround: {
      slots: {
        link: 'px-5 py-4',
        linkLeading:
          'mb-3.5 gap-2 rounded-none bg-transparent p-0 ring-0 group-hover:bg-transparent group-hover:ring-0 text-xs font-medium uppercase tracking-wide text-muted',
        linkTitle: 'mb-0.5',
      },
      variants: {
        direction: {
          right: {
            // Nuxt UI only passes `direction` to `link` and `linkLeadingIcon`,
            // so colour the label and title through descendant selectors. Light mode
            // uses emerald-700 (~5:1 on white); the primary green is only ~2.5:1.
            link: 'border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary [&_[data-slot=linkLeading]]:text-emerald-700 [&_[data-slot=linkTitle]]:text-emerald-700 dark:[&_[data-slot=linkLeading]]:text-primary dark:[&_[data-slot=linkTitle]]:text-primary',
          },
        },
      },
    },
    separator: {
      variants: {
        orientation: {
          // Docus renders "Edit this page or Report an issue" as a flex row
          // inside a horizontal separator; let that row wrap on phones.
          horizontal: {
            container: 'max-sm:[&>div]:flex-wrap max-sm:[&>div]:justify-center',
          },
        },
      },
    },
  },
  github: {
    url: 'https://github.com/visual-regression/visual-regression',
    branch: 'main',
    rootDir: 'apps/site',
  },
  toc: {
    title: 'On this page',
    bottom: {
      title: 'Elsewhere',
      links: [
        {
          icon: 'i-lucide-github',
          label: 'Source on GitHub',
          to: 'https://github.com/visual-regression/visual-regression',
          target: '_blank',
        },
      ],
    },
  },
});
