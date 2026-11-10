import fs from 'fs';
import path from 'path';
import {
  needsHuman,
  toCtrf,
  type Manifest,
  type ManifestEntry,
} from 'visual-regression-manifest';
import type { Reporter } from './types';

type Log = (line: string) => void;

const MARK: Record<ManifestEntry['status'], string> = {
  passed: '✓',
  failed: '✗',
  'missing-baseline': '?',
  created: '+',
  updated: '~',
  approved: '✓',
};

/** One line per screenshot as it is decided, then the counts. */
export const consoleReporter = (
  log: Log = (line) => process.stdout.write(`${line}\n`),
): Reporter => ({
  onEntry(entry) {
    const note =
      entry.status === 'passed' ? '' : ` ${entry.status}: ${entry.message}`;
    log(`${MARK[entry.status]} ${entry.name}${note}`);
  },
  onEnd({ summary }) {
    const parts = [
      `${summary.passed} passed`,
      `${summary.failed} failed`,
      `${summary.missingBaseline} without baseline`,
      `${summary.created} created`,
      `${summary.updated} updated`,
    ];
    log(`\n${summary.entries} compared: ${parts.join(', ')}`);
  },
});

/** The finished run as a CTRF report. */
export const ctrfReporter = (file: string): Reporter => ({
  onEnd(manifest) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(toCtrf(manifest), null, 2));
  },
});

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Markdown for a GitHub job summary: the counts and a table of what needs a human. */
export const summaryMarkdown = ({ summary, entries }: Manifest) => {
  const lines = [
    '### Visual regression',
    '',
    `${summary.entries} screenshots: ${summary.passed} passed, ${summary.failed} failed, ${summary.missingBaseline} without baseline, ${summary.created} created, ${summary.updated} updated.`,
  ];
  const open = entries.filter((entry) => needsHuman(entry.status));
  if (open.length > 0) {
    lines.push('', '| Screenshot | Status | Details |', '| --- | --- | --- |');
    for (const entry of open) {
      lines.push(
        `| ${cell(entry.name)} | ${entry.status} | ${cell(entry.message)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
};

/** Appends the summary to `file`, by default the job summary GitHub points `GITHUB_STEP_SUMMARY` at. */
export const githubSummaryReporter = (
  file: string | undefined = process.env.GITHUB_STEP_SUMMARY,
): Reporter => ({
  onEnd(manifest) {
    if (!file) return;
    fs.appendFileSync(file, summaryMarkdown(manifest));
  },
});

export const REPORTER_NAMES = ['console', 'ctrf', 'github-summary'] as const;

/** `console,ctrf:report.json,github-summary[:<path>]` as reporters. */
export const parseReporters = (spec: string): Reporter[] =>
  spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      const name = colon === -1 ? part : part.slice(0, colon);
      const arg = colon === -1 ? undefined : part.slice(colon + 1);
      switch (name) {
        case 'console':
          return consoleReporter();
        case 'ctrf':
          return ctrfReporter(arg ?? 'ctrf-report.json');
        case 'github-summary':
          return githubSummaryReporter(arg);
        default:
          throw new Error(
            `Unknown reporter "${name}" (known: ${REPORTER_NAMES.join(', ')})`,
          );
      }
    });
