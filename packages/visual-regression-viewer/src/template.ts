import fs from 'fs';
import { fileURLToPath } from 'url';

/** The page the package was built with (`dist/template.html`), or the one at `file`. */
export const readTemplate = (file?: string) => {
  if (file) return fs.readFileSync(file, 'utf8');
  const builtIn = [
    // next to the bundle, or (running from source) in the build output
    new URL('./template.html', import.meta.url),
    new URL('../dist/template.html', import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find((candidate) => fs.existsSync(candidate));
  if (!builtIn) {
    throw new Error(
      'The built-in page template is missing; the package was not built (run `pnpm build`)',
    );
  }
  return fs.readFileSync(builtIn, 'utf8');
};
