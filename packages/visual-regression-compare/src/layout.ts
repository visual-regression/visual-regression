import { IMAGE_SUFFIX } from 'visual-regression-manifest';
import type { ImageKind, Layout, Matcher } from './types';

/** Replaces characters no file system accepts and drops `.`/`..` segments, so a screenshot name is always a safe relative path. */
export const sanitizeName = (name: string) =>
  name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\:*?"<>|\u0000-\u001f]/g, '-')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/') || 'screenshot';

/**
 * The manifest convention: `<name>.png` is the baseline, `<name>.actual.png`
 * and `<name>.diff.png` sit beside it (or in the diff directory).
 */
export const manifestLayout = (): Layout => ({
  paths: (name) => ({
    baseline: `${name}.png`,
    incoming: `${name}.png`,
    actual: `${name}${IMAGE_SUFFIX.actual}.png`,
    diff: `${name}${IMAGE_SUFFIX.diff}.png`,
  }),
  nameOf(kind: ImageKind, file: string) {
    if (!file.endsWith('.png')) return null;
    const stem = file.slice(0, -'.png'.length);
    const suffix =
      kind === 'actual'
        ? IMAGE_SUFFIX.actual
        : kind === 'diff'
          ? IMAGE_SUFFIX.diff
          : '';
    if (suffix)
      return stem.endsWith(suffix) ? stem.slice(0, -suffix.length) : null;
    return stem.endsWith(IMAGE_SUFFIX.actual) ||
      stem.endsWith(IMAGE_SUFFIX.diff)
      ? null
      : stem;
  },
});

/** The baseline is the same relative path under the baseline directory. */
export const samePathMatcher = (): Matcher => ({
  baselineFor: (incoming) => ({ kind: 'baseline', path: incoming.path }),
});

/**
 * The baseline path from a template over the incoming path: `{dir}` (with its
 * trailing slash, empty at the top level), `{name}` (file stem) and `{path}`
 * (directory and stem), e.g. `{dir}{name}-baseline.png`.
 */
export const templateMatcher = (template: string): Matcher => ({
  baselineFor({ path: incoming }) {
    const slash = incoming.lastIndexOf('/');
    const dir = slash === -1 ? '' : incoming.slice(0, slash + 1);
    const name = incoming.slice(slash + 1).replace(/\.png$/, '');
    return {
      kind: 'baseline',
      path: template
        .replaceAll('{dir}', dir)
        .replaceAll('{name}', name)
        .replaceAll('{path}', `${dir}${name}`),
    };
  },
});
