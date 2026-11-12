// The package is ESM, so a TypeScript consumer on `moduleResolution: node16`
// or `nodenext` resolves `from './types'` in the .d.ts files to nothing and
// every type that comes through it becomes `any`. tsc leaves the specifiers as
// written in the (bundler-resolved) sources; spell out the file they mean.
import fs from 'node:fs';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

const declarations = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return declarations(file);
    return entry.name.endsWith('.d.ts') ? [file] : [];
  });

const withExtension = (from, specifier) => {
  if (!specifier.startsWith('.') || /\.[cm]?[jt]s$/.test(specifier)) {
    return specifier;
  }
  const target = path.resolve(path.dirname(from), specifier);
  return fs.existsSync(target) && fs.statSync(target).isDirectory()
    ? `${specifier}/index.js`
    : `${specifier}.js`;
};

for (const file of declarations(dist)) {
  const text = fs.readFileSync(file, 'utf8');
  const fixed = text.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.[^'"]*)\2/g,
    (_, lead, quote, specifier) =>
      `${lead}${quote}${withExtension(file, specifier)}${quote}`,
  );
  if (fixed !== text) fs.writeFileSync(file, fixed);
}
