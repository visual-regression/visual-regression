import fs from 'fs';
import path from 'path';
import {
  ManifestWriter,
  getManifestFileName,
} from 'visual-regression-manifest';
import type { ComparerOptions } from './types';

export const TOOL_NAME = 'visual-regression-compare';

const packageVersion = (): string | undefined => {
  try {
    const text = fs.readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    return (JSON.parse(text) as { version?: string }).version;
  } catch {
    return undefined;
  }
};

/** The comparer's own manifest file, for a caller that brings no writer. */
export const createManifestWriter = (
  options: ComparerOptions,
  projectRoot: string,
) =>
  new ManifestWriter(
    path.resolve(
      projectRoot,
      options.manifest.path ??
        path.join(projectRoot, getManifestFileName('compare')),
    ),
    {
      projectRoot,
      tool: options.manifest.tool ?? {
        name: TOOL_NAME,
        version: packageVersion(),
      },
      runner: options.manifest.runner ?? { name: TOOL_NAME },
      options: {
        engine:
          typeof options.engine === 'object'
            ? options.engine.name
            : (options.engine ?? 'pixelmatch'),
        engineOptions: options.engineOptions ?? {},
        limits: options.limits ?? {},
        onMissingBaseline: options.onMissingBaseline ?? 'fail',
        onSizeMismatch: options.onSizeMismatch ?? 'fail',
        update: options.update ?? 'none',
      },
    },
    { writeDelayMs: 200 },
  );
