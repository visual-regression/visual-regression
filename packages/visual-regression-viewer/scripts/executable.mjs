// the bundle starts with a shebang; make it executable for local runs
import fs from 'node:fs';

fs.chmodSync(new URL('../dist/cli.js', import.meta.url), 0o755);
