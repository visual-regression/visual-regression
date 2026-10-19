#!/usr/bin/env node
/**
 * Generates the command line page of the viewer from the package README, so
 * the site can never drift from `visual-regression-viewer`:
 * `content/4.viewer/2.cli.md` is the README without its HTML header, its
 * table of contents and its licence section, with links to the site
 * rewritten to site paths.
 *
 * The generated file carries `generated: true` in its frontmatter and is
 * rewritten on every run. Runs before `nuxt dev` and `nuxt generate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(
  path.resolve(site, '../../packages/visual-regression-viewer/README.md'),
  'utf8',
);

// a `## ` line inside a fenced code block is not a heading
const splitSections = (text) => {
  const parts = [[]];
  let fence = null;
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && !fence) fence = marker[0];
    else if (marker && marker[0] === fence) fence = null;
    if (!fence && !marker && line.startsWith('## ')) {
      parts.push([line.slice(3)]);
    } else {
      parts.at(-1).push(line);
    }
  }
  return parts.map((lines) => lines.join('\n'));
};

const [head, ...sections] = splitSections(readme);
const intro = head
  .split('\n')
  // the HTML header (`<h1>`, tagline, badges) and the table of contents
  .filter((line) => !/^(<|\s+<|\s*$)/.test(line) || line.trim() === '')
  .filter((line) => !/^- \[.+\]\(#[a-z0-9-]+\)$/.test(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const body = sections
  .filter((section) => !section.startsWith('License'))
  .map((section) => `## ${section.trim()}`)
  .join('\n\n');

const siteLinks = (text) =>
  text.replace(/\]\(https:\/\/visual-regression\.dev(\/[^)]*)\)/g, ']($1)');

fs.writeFileSync(
  path.join(site, 'content', '4.viewer', '2.cli.md'),
  `---
title: Command line
description: Serve the viewer, write it to a folder, restyle it or replace the page, from the command line.
generated: true
navigation:
  icon: i-lucide-terminal
---

${siteLinks(intro)}

${siteLinks(body)}
`,
);

console.log('sync-viewer: wrote content/4.viewer/2.cli.md');
