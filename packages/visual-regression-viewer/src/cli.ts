import fs from 'fs';
import { fileURLToPath } from 'url';
import { main } from './main';
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
  const running = await main(command.options);
  if (!running.url) return;
  const stop = () => void running.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
};

run().catch(fail);
