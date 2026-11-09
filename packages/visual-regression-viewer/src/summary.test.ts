import { describe, expect, it } from 'vitest';
import { MAX_LISTED, renderSummary } from './summary';
import type { ViewerData, ViewerEntry } from './types';

const entry = (overrides: Partial<ViewerEntry> = {}): ViewerEntry => ({
  id: 'a',
  name: 'home',
  status: 'failed',
  needsHuman: true,
  test: { filePath: 'e2e/home.cy.ts', titlePath: ['home'], retry: 0 },
  platform: '',
  message: '',
  source: 'visual-regression-manifest.json',
  comparison: { diffRatio: 0.1234 },
  images: { baseline: null, actual: null, diff: null },
  paths: { baseline: 'home.png', actual: null, diff: null },
  ...overrides,
});

const data = (entries: ViewerEntry[], overrides: Partial<ViewerData> = {}) =>
  ({
    title: 'Visual regression viewer',
    manifests: 1,
    tool: { name: 't' },
    runner: { name: 'r' },
    counts: {
      passed: entries.filter((e) => e.status === 'passed').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      'missing-baseline': entries.filter((e) => e.status === 'missing-baseline')
        .length,
      created: 0,
      updated: 0,
      approved: 0,
    },
    warnings: [],
    entries,
    ...overrides,
  }) as ViewerData;

describe('renderSummary', () => {
  it('says that nothing needs review and counts only the statuses present', () => {
    const text = renderSummary(
      data([entry({ status: 'passed', needsHuman: false })]),
    );
    expect(text).toContain('All 1 screenshots passed or were updated.');
    expect(text).toContain('| passed | 1 |');
    expect(text).not.toContain('| failed |');
    expect(text).not.toContain('| Screenshot |');
  });

  it('lists the screenshots to review, the biggest diff first', () => {
    const text = renderSummary(
      data([
        entry({ name: 'small', comparison: { diffRatio: 0.001 } }),
        entry({ name: 'big', comparison: { diffRatio: 0.5 } }),
        entry({ name: 'new', status: 'missing-baseline' }),
        entry({ name: 'ok', status: 'passed', needsHuman: false }),
      ]),
    );
    expect(text).toContain('3 of 4 screenshots need review.');
    expect(text.indexOf('| big |')).toBeLessThan(text.indexOf('| small |'));
    expect(text).toContain('| big | failed | e2e/home.cy.ts | 50% |');
    expect(text).toContain('| new | missing-baseline | e2e/home.cy.ts | - |');
    expect(text).not.toContain('| ok |');
  });

  it('lists at most MAX_LISTED screenshots and counts the rest', () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) =>
      entry({ name: `shot${i}` }),
    );
    const text = renderSummary(data(many));
    expect(text.match(/^\| shot/gm)).toHaveLength(MAX_LISTED);
    expect(text).toContain('…and 3 more.');
  });

  it('mentions the warnings of the run', () => {
    expect(renderSummary(data([], { warnings: ['a', 'b'] }))).toContain(
      '2 warnings while reading the run.',
    );
  });

  it('keeps manifest text from becoming Markdown, HTML or a table cell', () => {
    const text = renderSummary(
      data([entry({ name: 'a|b\n`c` <img src=x> [l](u)' })], {
        title: '# Hi *there*',
      }),
    );
    expect(text).toContain('## # Hi \\*there\\*');
    expect(text).toContain('| a\\|b \\`c\\` \\<img src=x\\> \\[l\\](u) |');
    expect(text).not.toMatch(/(^|[^\\])<img/);
  });
});
