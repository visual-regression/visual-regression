import type { EngineInfo } from '../types';
import * as blockhash from './blockhash';
import * as exact from './exact';
import * as pixelmatch from './pixelmatch';
import * as resemble from './resemble';
import * as ssim from './ssim';
import type { Engine } from './shared';

export const modules = [exact, pixelmatch, resemble, ssim, blockhash];

export const infos: EngineInfo[] = modules.map((m) => m.info);

export const engines: Record<string, Engine> = Object.fromEntries(
  modules.map((m) => [m.info.id, m.engine]),
);

export { resemble };
