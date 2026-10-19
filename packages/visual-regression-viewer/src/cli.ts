import fs from 'fs';
import { fileURLToPath } from 'url';
import { main, type Running } from './main';
import { UsageError, helpText, parseCommand } from './options';

const fail = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    error instanceof UsageError
      ? `${message}\nRun with --help for the options.`
      : `Error: ${message}`,
  );
  process.exit(1);
};

const run = async () => {
  const command = parseCommand(process.argv.slice(2));
  if (command.kind === 'help') return console.log(helpText);
  if (command.kind === 'version') {
    const { version } = JSON.parse(
      fs.readFileSync(
        fileURLToPath(new URL('../package.json', import.meta.url)),
        'utf8',
      ),
    );
    return console.log(version);
  }
  // installed first: a signal while a zip is unpacked or the watcher starts
  // must still exit through `process.exit`, which removes the unpacked files
  const started: Running[] = [];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    Promise.all(started.map((running) => running.close())).then(
      () => process.exit(0),
      fail,
    );
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  started.push(await main(command.options));
};

run().catch(fail);
