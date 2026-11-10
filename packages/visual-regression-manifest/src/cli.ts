import fs from 'fs';
import path from 'path';
import { getManifestFileName } from './constants';
import { UsageError, convertTool } from './cli/convert';
import { helpText, parseCommand } from './cli/options';
import { writeManifestFile } from './writer';

const fail = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    error instanceof UsageError
      ? `${message}\nRun with --help for the options.`
      : `Error: ${message}`,
  );
  process.exit(1);
};

const shown = (cwd: string, file: string) => {
  const relative = path.relative(cwd, file);
  return relative.startsWith('..') ? file : relative;
};

const run = () => {
  const command = parseCommand(process.argv.slice(2));
  if (command.kind === 'help') return console.log(helpText);
  if (command.kind === 'version') {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
    );
    return console.log(version);
  }
  const cwd = process.cwd();
  const manifest = convertTool(command.tool, command.flags, cwd);
  const out = path.resolve(cwd, command.out ?? command.flags.projectRoot);
  const file = out.endsWith('.json')
    ? out
    : path.join(out, getManifestFileName(command.tool));
  writeManifestFile(file, manifest);
  const { summary } = manifest;
  console.log(
    `Wrote ${shown(cwd, file)}: ${summary.entries} comparisons, ${summary.passed} passed, ${summary.failed} failed, ${summary.missingBaseline} without a baseline`,
  );
};

try {
  run();
} catch (error) {
  fail(error);
}
