import { describe, expect, it } from 'vitest';
import {
  manifestLayout,
  samePathMatcher,
  sanitizeName,
  templateMatcher,
} from './layout';

describe('sanitizeName', () => {
  it('keeps nested names and replaces what a file system rejects', () => {
    expect(sanitizeName('home/page: "a"?')).toBe('home/page- -a--');
    expect(sanitizeName('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeName('/')).toBe('screenshot');
    // would share a file with the actual or diff image of `x`
    expect(sanitizeName('a.actual/x.actual')).toBe('a.actual/x-actual');
    expect(sanitizeName('x.diff')).toBe('x-diff');
  });
});

describe('manifestLayout', () => {
  const layout = manifestLayout();

  it('names the files of a screenshot', () => {
    expect(layout.paths('a/b')).toEqual({
      baseline: 'a/b.png',
      incoming: 'a/b.png',
      actual: 'a/b.actual.png',
      diff: 'a/b.diff.png',
    });
  });

  it('reads the name back and refuses files it does not own', () => {
    expect(layout.nameOf('baseline', 'a/b.png')).toBe('a/b');
    expect(layout.nameOf('baseline', 'a/b.actual.png')).toBeNull();
    expect(layout.nameOf('actual', 'a/b.actual.png')).toBe('a/b');
    expect(layout.nameOf('actual', 'a/b.png')).toBeNull();
    expect(layout.nameOf('diff', 'a/b.diff.png')).toBe('a/b');
    expect(layout.nameOf('incoming', 'a/b.jpg')).toBeNull();
  });
});

describe('matchers', () => {
  const incoming = { kind: 'incoming', path: 'pages/home.png' } as const;

  it('maps to the same relative path by default', () => {
    expect(samePathMatcher().baselineFor(incoming)).toEqual({
      kind: 'baseline',
      path: 'pages/home.png',
    });
  });

  it('fills a template', () => {
    expect(
      templateMatcher('{dir}{name}-ref.png').baselineFor(incoming)?.path,
    ).toBe('pages/home-ref.png');
    expect(
      templateMatcher('{path}.base.png').baselineFor({
        kind: 'incoming',
        path: 'top.png',
      })?.path,
    ).toBe('top.base.png');
  });
});
