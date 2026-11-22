import fs from 'fs';
import path from 'path';
import { writeAllureResults } from '../convert/allure';
import { toJUnit } from '../convert/junit';
import { readManifestFile } from '../reader';
import type { Manifest } from '../types';
import { UsageError } from './convert';

/** What the user typed, parsed; paths are as typed, relative to the working directory. */
export type ExportFlags = {
  /** The manifest file to export. */
  manifest: string;
  /** Where to write; defaults to the format's conventional name in the working directory. */
  out?: string;
  /** Where the manifest's image paths resolve, when that is not the `projectRoot` it records. */
  projectRoot?: string;
  /** Exporter options merged over the defaults. */
  options?: Record<string, unknown>;
};

type Format = {
  /** What is written: a `folder`, or a `file`, which `--out` may name itself or by its folder. */
  kind: 'folder' | 'file';
  defaultOut: string;
  /** Whether the export reads the images, so that `--project-root` says where they are. */
  readsImages: boolean;
  /** The exporter options `--options` may set. */
  options: readonly string[];
  /** Writes the export and returns the line to print. */
  run: (ctx: {
    manifest: Manifest;
    /** Absolute path of the folder or file to write. */
    out: string;
    options: Record<string, unknown>;
    warn: (message: string) => void;
  }) => string;
};

export const FORMATS: Record<string, Format> = {
  allure: {
    kind: 'folder',
    defaultOut: 'allure-results',
    readsImages: true,
    options: [],
    run: ({ manifest, out, warn }) => {
      const files = writeAllureResults(out, manifest, { onWarning: warn });
      const results = files.filter((file) => file.endsWith('-result.json'));
      return `${results.length} Allure results (${files.length} files)`;
    },
  },
  junit: {
    kind: 'file',
    defaultOut: 'visual-regression-junit.xml',
    readsImages: false,
    options: ['name', 'attachmentPaths'],
    run: ({ manifest, out, options }) => {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, toJUnit(manifest, options));
      const { entries, needsHuman } = manifest.summary;
      return `${entries} test cases, ${needsHuman} failed`;
    },
  },
};

/**
 * Writes the manifest file as another format and returns the path written and
 * a summary of it. Relative paths resolve against `cwd`.
 */
export const exportManifest = (
  name: string,
  flags: ExportFlags,
  cwd: string,
  warn: (message: string) => void = (message) => process.emitWarning(message),
): { out: string; summary: string } => {
  const format = FORMATS[name];
  if (!format) {
    throw new UsageError(
      `Unknown format ${JSON.stringify(name)}. Choose one of: ${Object.keys(FORMATS).join(', ')}`,
    );
  }
  if (flags.projectRoot !== undefined && !format.readsImages) {
    throw new UsageError(
      `--project-root does not apply to ${name}: it reads no images, and writes the paths the manifest records`,
    );
  }
  const unknown = Object.keys(flags.options ?? {}).find(
    (key) => !format.options.includes(key),
  );
  if (unknown !== undefined) {
    throw new UsageError(
      `--options has ${JSON.stringify(unknown)}, which ${name} does not take${
        format.options.length ? `; it takes ${format.options.join(', ')}` : ''
      }`,
    );
  }
  const file = path.resolve(cwd, flags.manifest);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new UsageError(`The manifest ${file} is not a file`);
  }
  const read = readManifestFile(file);
  let manifest = read;
  if (flags.projectRoot !== undefined) {
    const projectRoot = path.resolve(cwd, flags.projectRoot);
    if (!fs.statSync(projectRoot, { throwIfNoEntry: false })?.isDirectory()) {
      throw new UsageError(
        `The project root ${projectRoot} is not a directory`,
      );
    }
    manifest = { ...read, projectRoot };
  }
  const typed = path.resolve(cwd, flags.out ?? format.defaultOut);
  // like `convert -o`: a path without the file's extension is the folder to put it in
  const out =
    format.kind === 'file' &&
    path.extname(typed).toLowerCase() !== path.extname(format.defaultOut)
      ? path.join(typed, format.defaultOut)
      : typed;
  let summary: string;
  try {
    summary = format.run({
      manifest,
      out,
      options: flags.options ?? {},
      warn,
    });
  } catch (error) {
    // a wrong option value, or a path that cannot be written (a file where a folder is due)
    throw new UsageError(`Cannot write ${out}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return { out, summary };
};
