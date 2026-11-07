// What the page needs to know about the engines (names, options, defaults)
// without loading the libraries behind them: those live in the worker.
import type { EngineInfo } from '../types';
import { info as exact } from './exact-info';
import { info as phash } from './phash-info';
import { info as pixelmatch } from './pixelmatch-info';
import { info as resemble } from './resemble-info';
import { info as ssim } from './ssim-info';

export const infos: EngineInfo[] = [exact, pixelmatch, resemble, ssim, phash];
