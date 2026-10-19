export default defineNuxtConfig({
  extends: ['docus'],

  css: ['~/assets/css/main.css'],

  site: {
    url: 'https://visual-regression.dev',
    name: 'visual-regression.dev',
  },

  app: {
    head: {
      link: [
        // Docus adds `/favicon.ico`; the SVG wins in browsers that support it.
        { rel: 'icon', type: 'image/svg+xml', href: '/brand/mark.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  // Fully static: every route is prerendered by `nuxt generate` and served as
  // Cloudflare Pages static files (see `wrangler.jsonc`). No server at runtime.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },

  // Docus ships an MCP server (`/mcp`) and page-header links to it, but that
  // needs a runtime. The site is static, so switch the module off rather than
  // advertise an endpoint that 404s.
  mcp: {
    enabled: false,
  },

  compatibilityDate: '2026-10-01',
});
