#!/usr/bin/env node
// Checks the statically generated site (`pnpm --filter @visual-regression/site build`)
// without a server: routes exist, generated docs made it in, the schema is published,
// every internal link resolves, pixsame is in the comparison, tool data is sourced.
//   node check-output.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const site = path.join(repo, 'apps/site');
const out = path.join(site, '.output/public');
if (!fs.existsSync(out)) {
  console.error(
    'no .output/public: run `pnpm --filter @visual-regression/site build` first',
  );
  process.exit(1);
}
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
};
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)],
    );
const exists = (route) => {
  const p = decodeURIComponent(route.split(/[?#]/)[0]).replace(/\/+$/, '');
  return [p, `${p}.html`, `${p}/index.html`].some((c) => {
    const f = path.join(out, c);
    return fs.existsSync(f) && fs.statSync(f).isFile();
  });
};

check('routes: every content page is prerendered', () => {
  const missing = [];
  const root = path.join(site, 'content');
  const strip = (name) => name.replace(/^\d+\./, '');
  const visit = (dir, base) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory())
        visit(path.join(dir, d.name), `${base}/${strip(d.name)}`);
      else if (d.name.endsWith('.md')) {
        const slug = strip(d.name.replace(/\.md$/, ''));
        const route = slug === 'index' ? base || '/' : `${base}/${slug}`;
        if (!exists(route)) missing.push(route);
      }
    }
  };
  visit(root, '');
  assert.deepEqual(missing, [], `not prerendered: ${missing.join(', ')}`);
});

check(
  'generated: manifest and viewer pages exist and are marked generated',
  () => {
    for (const f of [
      '3.manifest/2.format.md',
      '3.manifest/8.schema.md',
      '4.viewer/2.cli.md',
    ]) {
      const text = fs.readFileSync(path.join(site, 'content', f), 'utf8');
      assert.match(text, /^generated: true$/m, `${f} lacks generated: true`);
    }
  },
);
check(
  'schema: published at /schema/v1.json and equal to the package schema',
  () => {
    const published = fs.readFileSync(path.join(out, 'schema/v1.json'), 'utf8');
    const source = fs.readFileSync(
      path.join(repo, 'packages/visual-regression-manifest/src/schema.json'),
      'utf8',
    );
    assert.deepEqual(JSON.parse(published), JSON.parse(source));
  },
);
check('links: every internal href in the built pages resolves', () => {
  const broken = new Set();
  for (const file of walk(out).filter(
    (f) => f.endsWith('.html') && !f.endsWith('200.html'),
  )) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [, href] of html.matchAll(/\b(?:href|src)="(\/[^"/][^"]*)"/g)) {
      if (
        href.startsWith('//') ||
        href.startsWith('/_nuxt/') ||
        href.startsWith('/_og/')
      )
        continue;
      if (!exists(href)) broken.add(`${href} (in ${path.relative(out, file)})`);
    }
  }
  assert.equal(broken.size, 0, `broken: ${[...broken].slice(0, 8).join('; ')}`);
});
check(
  'conventions: pixsame is a row of the comparison data and shown on /compare',
  () => {
    assert.ok(fs.existsSync(path.join(site, 'data/tools/pixsame.yml')));
    const blob = walk(path.join(out, 'compare'))
      .concat(path.join(out, 'compare.html'))
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    assert.match(blob, /pixsame/i);
  },
);
check('tool data: every tools/*.yml has sources and lastVerified', () => {
  const bad = [];
  for (const f of fs.readdirSync(path.join(site, 'data/tools'))) {
    const t = fs.readFileSync(path.join(site, 'data/tools', f), 'utf8');
    if (
      !/^lastVerified: '?\d{4}-\d{2}-\d{2}'?$/m.test(t) ||
      (!/^sources:\s*\n\s*-\s*\S/m.test(t) && !/^sources:\s*\n\s+\w+:/m.test(t))
    )
      bad.push(f);
  }
  assert.deepEqual(bad, [], `missing sources/lastVerified: ${bad.join(', ')}`);
});
check('git: generated files are not tracked', () => {
  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      'apps/site/content/3.manifest',
      'apps/site/content/4.viewer',
      'apps/site/public/schema',
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.ok(
    !/\/[2-9]\.[^/]+\.md$|public\/schema/.test(tracked),
    `tracked generated files:\n${tracked}`,
  );
});
