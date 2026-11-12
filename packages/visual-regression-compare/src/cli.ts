import { runCli } from './run';

process.exitCode = await runCli(process.argv.slice(2), {
  log: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
});
