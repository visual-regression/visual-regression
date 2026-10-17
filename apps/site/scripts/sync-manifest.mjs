#!/usr/bin/env node
/**
 * Generates the manifest documentation pages from the package itself, so the
 * site can never drift from `visual-regression-manifest`:
 *
 * - `public/schema/v1.json` is a copy of the package's `src/schema.json`
 *   (the schema's `$id` points at that URL).
 * - `content/3.manifest/<n>.<slug>.md` pages are the `##` sections of the
 *   package README, one page each, with the HTML header and the table of
 *   contents stripped and the intra-document links rewritten.
 * - `content/3.manifest/<n>.schema.md` is a field-by-field reference built
 *   from the schema.
 *
 * Generated files carry `generated: true` in their frontmatter and are
 * deleted and rewritten on every run; hand-written pages in the same folder
 * are left alone. Runs before `nuxt dev` and `nuxt generate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.resolve(site, '../../packages/visual-regression-manifest');
const readme = fs.readFileSync(path.join(pkg, 'README.md'), 'utf8');
const schema = JSON.parse(
  fs.readFileSync(path.join(pkg, 'src', 'schema.json'), 'utf8'),
);
const contentDir = path.join(site, 'content', '3.manifest');

// 1. the schema, at the URL its `$id` names
const schemaOut = path.join(site, 'public', 'schema', 'v1.json');
fs.mkdirSync(path.dirname(schemaOut), { recursive: true });
fs.writeFileSync(schemaOut, JSON.stringify(schema, null, 2) + '\n');

// 2. drop stale generated pages
for (const file of fs.readdirSync(contentDir)) {
  const full = path.join(contentDir, file);
  if (
    file.endsWith('.md') &&
    /^---\n(?:.*\n)*?generated: true\n/.test(fs.readFileSync(full, 'utf8'))
  ) {
    fs.unlinkSync(full);
  }
}

// 3. README sections -> pages
const PAGES = {
  'The format': { slug: 'format', icon: 'i-lucide-file-code', order: 2 },
  'Reading manifests': {
    slug: 'reading',
    icon: 'i-lucide-book-open-check',
    order: 3,
  },
  'Merging the manifests of a run': {
    slug: 'merging',
    icon: 'i-lucide-merge',
    order: 4,
  },
  'Writing manifests': {
    slug: 'writing',
    icon: 'i-lucide-pencil-line',
    order: 5,
  },
  'Converting to and from other formats': {
    slug: 'converting',
    icon: 'i-lucide-arrow-left-right',
    order: 6,
  },
  Reference: { slug: 'reference', icon: 'i-lucide-list', order: 7 },
};
const slugByHeading = Object.fromEntries(
  Object.entries(PAGES).map(([heading, { slug }]) => [
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    slug,
  ]),
);

const sections = readme.split(/^## /m).slice(1);
const frontmatter = (fields) =>
  '---\n' +
  Object.entries(fields)
    .map(([k, v]) =>
      typeof v === 'object'
        ? `${k}:\n` +
          Object.entries(v)
            .map(([kk, vv]) => `  ${kk}: ${vv}`)
            .join('\n')
        : `${k}: ${JSON.stringify(v)}`,
    )
    .join('\n') +
  '\n---\n\n';

const rewriteLinks = (body) =>
  body
    // `#the-format` style anchors -> pages
    .replace(/\]\(#([a-z0-9-]+)\)/g, (m, anchor) =>
      slugByHeading[anchor] ? `](/manifest/${slugByHeading[anchor]})` : m,
    )
    // one level of heading down: sections become pages, their `###` become `##`
    .replace(/^### /gm, '## ')
    .replace(/^#### /gm, '### ');

const describe = (heading) => {
  const first = readme
    .split(/^## /m)
    .slice(1)
    .find((s) => s.startsWith(heading + '\n'));
  // the first prose line: not a heading, a table row or anything inside a
  // code fence (a section may open with a sub-heading or an example)
  let inFence = false;
  const para = first
    ?.split('\n')
    .slice(1)
    .find((l) => {
      if (l.startsWith('```')) {
        inFence = !inFence;
        return false;
      }
      return !inFence && l.trim() && !/^(#|\|)/.test(l.trim());
    });
  const plain =
    para?.replace(/[`*_[\]]/g, '').replace(/\(https?:[^)]+\)/g, '') ?? '';
  // the first sentence, so the description never stops mid-thought
  return plain.match(/^.*?[.:](?=\s|$)/)?.[0] ?? plain.slice(0, 160);
};

for (const section of sections) {
  const [heading, ...rest] = section.split('\n');
  const page = PAGES[heading.trim()];
  if (!page) continue;
  const body = rewriteLinks(rest.join('\n').trim());
  fs.writeFileSync(
    path.join(contentDir, `${page.order}.${page.slug}.md`),
    frontmatter({
      title: heading.trim(),
      description: describe(heading.trim()),
      generated: true,
      navigation: { icon: page.icon },
    }) +
      body +
      '\n',
  );
}

// 4. schema -> field reference
const md = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
const typeOf = (def) => {
  if (def.$ref)
    return `[${def.$ref.replace('#/$defs/', '')}](#${def.$ref.replace('#/$defs/', '').toLowerCase()})`;
  if (def.const !== undefined) return `\`${JSON.stringify(def.const)}\``;
  if (def.enum)
    return def.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  if (def.anyOf) return def.anyOf.map(typeOf).join(' \\| ');
  if (def.allOf) return def.allOf.map(typeOf).join(' & ');
  if (def.type === 'array') return `array of ${typeOf(def.items ?? {})}`;
  if (Array.isArray(def.type)) return def.type.join(' \\| ');
  return def.type ?? 'any';
};
const table = (obj, required = []) => {
  const rows = Object.entries(obj.properties ?? {}).map(
    ([name, def]) =>
      `| \`${name}\` | ${typeOf(def)} | ${required.includes(name) ? 'yes' : ''} | ${md(def.description)} |`,
  );
  return rows.length
    ? [
        '| field | type | required | description |',
        '| --- | --- | --- | --- |',
        ...rows,
      ].join('\n')
    : '_An open object; see the description._';
};
const nested = (def, depth = 3) =>
  Object.entries(def.properties ?? {})
    .filter(([, d]) => d.type === 'object' && d.properties)
    .map(
      ([name, d]) =>
        `${'#'.repeat(depth)} \`${name}\`\n\n${d.description ? md(d.description) + '\n\n' : ''}${table(d, d.required)}\n\n${nested(d, depth + 1)}`,
    )
    .join('');

let ref = frontmatter({
  title: 'Schema reference',
  description:
    'Every field of the manifest, as defined by the JSON Schema at /schema/v1.json.',
  generated: true,
  navigation: { icon: 'i-lucide-braces' },
});
ref += `The JSON Schema (draft 2020-12) at [\`${schema.$id}\`](${new URL(schema.$id).pathname}) is the normative description of the format. The \`visual-regression-manifest\` package ships it as \`schema.json\`.\n\n`;
ref += `${md(schema.description)}\n\n## Top level\n\n${table(schema, schema.required)}\n\n${nested(schema)}`;
for (const [name, def] of Object.entries(schema.$defs ?? {})) {
  ref += `## ${name}\n\n${def.description ? md(def.description) + '\n\n' : ''}`;
  ref += def.properties
    ? `${table(def, def.required)}\n\n${nested(def)}`
    : def.enum
      ? `One of ${def.enum.map((v) => `\`${JSON.stringify(v)}\``).join(', ')}.\n\n`
      : `Type: ${typeOf(def)}${def.pattern ? `, matching \`${def.pattern}\`` : ''}.\n\n`;
}
fs.writeFileSync(path.join(contentDir, '8.schema.md'), ref);

console.log(
  `sync-manifest: wrote public/schema/v1.json and ${Object.keys(PAGES).length + 1} pages into content/3.manifest`,
);
