import fs from 'fs';
import path from 'path';
import type { ManifestEntry } from 'visual-regression-manifest';
import { approve } from './approve';
import { createComparer } from './comparer';
import { configArg, loadConfig } from './config';
import { fsStore } from './store';
import { manifestLayout, samePathMatcher, templateMatcher } from './layout';
import {
  UsageError,
  helpText,
  parseCommand,
  type ApproveCliOptions,
  type CompareCliOptions,
} from './options';
import { parseReporters } from './reporters';

type Out = { log(line: string): void; error(line: string): void };

const platformOf = (spec: string | undefined) => {
  if (!spec) return undefined;
  const [osPlatform, browser] = spec.split('/');
  return { osPlatform, ...(browser && { browser: { name: browser } }) };
};

const compare = async (
  options: CompareCliOptions,
  version: string,
  out: Out,
) => {
  const actualDir = path.resolve(options.actualDir);
  const comparer = createComparer({
    engine: options.engine,
    engineOptions: options.engineOptions,
    limits: {
      maxDiffRatio: options.maxDiffRatio,
      maxDiffPixels: options.maxDiffPixels,
    },
    onMissingBaseline: options.onMissingBaseline,
    onSizeMismatch: options.onSizeMismatch,
    update: options.update,
    store: fsStore({
      baselineDir: options.baselineDir,
      actualDir,
      diffDir: options.diffDir,
    }),
    layout: manifestLayout(),
    matcher: options.match ? templateMatcher(options.match) : samePathMatcher(),
    manifest: {
      path:
        options.manifest ??
        path.join(actualDir, 'visual-regression-manifest.compare.json'),
      projectRoot: commonRoot([
        actualDir,
        path.resolve(options.baselineDir),
        ...(options.diffDir ? [path.resolve(options.diffDir)] : []),
      ]),
      tool: { name: 'visual-regression-compare', version },
      runner: { name: options.runner ?? 'visual-regression-compare' },
      platform: platformOf(options.platform),
      variant: options.variant,
    },
    reporters: parseReporters(options.report),
    concurrency: options.concurrency,
  });
  try {
    await comparer.compareAll();
  } finally {
    // also after a failure: the worker threads would keep the process alive
    await comparer.close();
  }
  const manifest = comparer.writer.toJSON();
  const failing = manifest.entries.filter((entry: ManifestEntry) =>
    options.failOn.includes(entry.status),
  );
  if (manifest.entries.length === 0) {
    out.error(`No images found in ${options.actualDir}`);
    return 1;
  }
  out.log(`Manifest: ${comparer.writer.filePath}`);
  return failing.length > 0 ? 1 : 0;
};

const commonRoot = (dirs: string[]) => {
  const split = dirs.map((dir) => dir.split(path.sep));
  const shared: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    if (split.every((parts) => parts[i] === split[0][i]))
      shared.push(split[0][i]);
    else break;
  }
  return shared.join(path.sep) || path.sep;
};

const approveCommand = (options: ApproveCliOptions, out: Out) => {
  const result = approve({
    manifests: options.manifests,
    names: options.all ? undefined : options.names,
    testFile: options.test,
    repoRoot: options.repoRoot,
    force: options.force,
    dryRun: options.dryRun,
  });
  for (const warning of result.warnings) out.error(`warning: ${warning}`);
  for (const name of result.unknown) out.error(`No entry named "${name}"`);
  for (const { entry, reason } of result.skipped) {
    out.error(`skipped ${entry.name}: ${reason}`);
  }
  const verb = options.dryRun ? 'Would approve' : 'Approved';
  out.log(
    `${verb} ${result.approved.length} screenshot${result.approved.length === 1 ? '' : 's'}`,
  );
  for (const file of result.files) out.log(`  ${file}`);
  return result.skipped.length > 0 || result.unknown.length > 0 ? 1 : 0;
};

/** Runs the CLI and returns its exit code. */
export const runCli = async (argv: string[], out: Out): Promise<number> => {
  try {
    const config = await loadConfig(configArg(argv));
    const command = parseCommand(argv, config);
    if (command.kind === 'help') {
      out.log(helpText);
      return 0;
    }
    const { version } = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    if (command.kind === 'version') {
      out.log(version);
      return 0;
    }
    return command.kind === 'approve'
      ? approveCommand(command.options, out)
      : await compare(command.options, version, out);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out.error(
      error instanceof UsageError
        ? `${message}\nRun with --help for the options.`
        : `Error: ${message}`,
    );
    return 2;
  }
};
