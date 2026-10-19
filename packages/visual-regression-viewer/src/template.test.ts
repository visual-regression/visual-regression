import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { tmpDir, writeFile } from '../__tests__/helpers';
import { DATA_MARKER } from './render';
import { readTemplate } from './template';

describe('readTemplate', () => {
  it('reads the template at a path', async () => {
    const file = writeFile(path.join(await tmpDir(), 't.html'), 'custom');
    expect(readTemplate(file)).toBe('custom');
  });

  it.skipIf(
    !fs.existsSync(
      fileURLToPath(new URL('../dist/template.html', import.meta.url)),
    ),
  )('finds the built-in template, which has the data marker', () => {
    expect(readTemplate()).toContain(DATA_MARKER);
  });
});
