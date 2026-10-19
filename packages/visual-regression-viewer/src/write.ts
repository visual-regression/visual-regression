import fs from 'fs';
import path from 'path';

/** Writes `index.html` and the images it links to (keeping their relative paths) into `outDir`. */
export const writeOutput = (
  outDir: string,
  html: string,
  files: Map<string, string>,
) => {
  const out = path.resolve(outDir);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  for (const [rel, source] of files) {
    const target = path.join(out, ...rel.split('/'));
    if (path.resolve(source) === target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
};
