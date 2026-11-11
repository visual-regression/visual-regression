import { MANIFEST_STATUSES } from 'visual-regression-manifest';
import type { ViewerData, ViewerEntry } from './types';

/** How many screenshots are listed; the rest is counted. */
export const MAX_LISTED = 20;

// manifest-derived text is untrusted: keep it from becoming inline Markdown, HTML or a table cell
// (it never starts a line, so list and heading markers cannot take effect)
const escape = (text: string) =>
  text.replace(/\r?\n/g, ' ').replace(/([\\`*_[\]<>|~&])/g, '\\$1');

const percent = (ratio: number) => `${Number((ratio * 100).toFixed(2))}%`;

const row = (entry: ViewerEntry) =>
  `| ${escape(entry.name)} | ${entry.status} | ${escape(entry.test.filePath || '-')} | ${
    entry.status === 'failed' ? percent(entry.comparison.diffRatio) : '-'
  } |`;

/**
 * A Markdown summary of the run for a CI job summary or a pull request
 * comment: the verdict, the count per status and the screenshots that need a
 * human, worst first.
 */
export const renderSummary = (data: ViewerData): string => {
  const review = data.entries.filter((entry) => entry.needsHuman);
  const lines = [
    `## ${escape(data.title)}`,
    '',
    review.length === 0
      ? `All ${data.entries.length} screenshots passed or were updated.`
      : `${review.length} of ${data.entries.length} screenshots need review.`,
    '',
    '| Status | Screenshots |',
    '| --- | ---: |',
    ...MANIFEST_STATUSES.filter((status) => data.counts[status] > 0).map(
      (status) => `| ${status} | ${data.counts[status]} |`,
    ),
  ];
  if (review.length > 0) {
    const worst = [...review].sort(
      (a, b) => b.comparison.diffRatio - a.comparison.diffRatio,
    );
    lines.push(
      '',
      '| Screenshot | Status | Test file | Diff |',
      '| --- | --- | --- | ---: |',
      ...worst.slice(0, MAX_LISTED).map(row),
    );
    if (worst.length > MAX_LISTED) {
      lines.push('', `…and ${worst.length - MAX_LISTED} more.`);
    }
  }
  if (data.warnings.length > 0) {
    lines.push('', `${data.warnings.length} warnings while reading the run.`);
  }
  return lines.join('\n') + '\n';
};
