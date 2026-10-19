import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// builds the viewer page into one HTML file, `dist/template.html`, that the
// CLI fills with the data of a run
export default defineConfig({
  root: fileURLToPath(new URL('./app', import.meta.url)),
  plugins: [vue(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./app/template.html', import.meta.url)),
    },
  },
});
