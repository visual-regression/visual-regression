import fs from 'fs';
import path from 'path';
import tmp from 'tmp-promise';
import { describe, expect, it } from 'vitest';
import { ManifestBuilder, type Manifest } from 'visual-regression-manifest';
import {
  consoleReporter,
  ctrfReporter,
  githubSummaryReporter,
  parseReporters,
  summaryMarkdown,
} from './reporters';

const manifest = (): Manifest => {
  const builder = new ManifestBuilder({
    projectRoot: '/p',
    runner: { name: 'r' },
    ci: null,
  });
  builder.record({
    actualPath: 'a.actual.png',
    baselinePath: 'a.png',
    status: 'failed',
    message: 'pipe | and\nnewline',
  });
  builder.record({
    actualPath: 'b.actual.png',
    baselinePath: 'b.png',
    status: 'passed',
  });
  return builder.toJSON();
};

describe('reporters', () => {
  it('console prints a line per entry and the counts', () => {
    const lines: string[] = [];
    const reporter = consoleReporter((line) => lines.push(line));
    for (const entry of manifest().entries) reporter.onEntry?.(entry);
    reporter.onEnd?.(manifest());
    expect(lines[0]).toBe('✗ a failed: pipe | and\nnewline');
    expect(lines[1]).toBe('✓ b');
    expect(lines[2]).toContain('2 compared: 1 passed, 1 failed');
  });

  it('summaryMarkdown tables what needs a human and escapes cells', () => {
    const markdown = summaryMarkdown(manifest());
    expect(markdown).toContain('| a | failed | pipe \\| and newline |');
    expect(markdown).not.toContain('| b |');
  });

  it('writes a CTRF report and a job summary', async () => {
    const dir = await tmp.dir({ unsafeCleanup: true });
    await ctrfReporter(path.join(dir.path, 'x/ctrf.json')).onEnd?.(manifest());
    expect(
      JSON.parse(fs.readFileSync(path.join(dir.path, 'x/ctrf.json'), 'utf8'))
        .reportFormat,
    ).toBe('CTRF');
    const summary = path.join(dir.path, 'summary.md');
    await githubSummaryReporter(summary).onEnd?.(manifest());
    expect(fs.readFileSync(summary, 'utf8')).toContain('### Visual regression');
    await githubSummaryReporter(undefined).onEnd?.(manifest());
    await dir.cleanup();
  });

  it('parses a reporter list', () => {
    expect(
      parseReporters('console, ctrf:a.json,github-summary:b.md,ctrf'),
    ).toHaveLength(4);
    expect(() => parseReporters('html')).toThrow(/Unknown reporter "html"/);
  });
});
