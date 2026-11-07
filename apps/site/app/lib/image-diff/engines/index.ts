import * as exact from './exact';
import * as phash from './phash';
import * as pixelmatch from './pixelmatch';
import * as resemble from './resemble';
import * as ssim from './ssim';
import type { Engine } from './shared';

export const engines: Record<string, Engine> = Object.fromEntries(
  Object.entries({ exact, pixelmatch, resemble, ssim, phash }).map(
    ([id, m]) => [id, m.engine],
  ),
);

export { resemble };
