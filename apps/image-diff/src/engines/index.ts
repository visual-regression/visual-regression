import type { EngineInfo } from '../types';
import * as exact from './exact';
import * as phash from './phash';
import * as pixelmatch from './pixelmatch';
import * as resemble from './resemble';
import * as ssim from './ssim';
import type { Engine } from './shared';

export const modules = [exact, pixelmatch, resemble, ssim, phash];

export const infos: EngineInfo[] = modules.map((m) => m.info);

export const engines: Record<string, Engine> = Object.fromEntries(
  modules.map((m) => [m.info.id, m.engine]),
);

export { resemble };
