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

const [head, ...sections] = readme.split(/^## /m);
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
