import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// A plain static build: `dist/` is what `wrangler pages deploy` uploads
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: { target: 'es2022' },
});
