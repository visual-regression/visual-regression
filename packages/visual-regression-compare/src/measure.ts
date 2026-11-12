import type { JobResult } from './job';
import type { CompareResult, ImagePart, Measurement } from './types';

/** What the engine saw, as the hooks and `decide` get it. */
export const toMeasurement = (job: JobResult): Measurement =>
  job.kind === 'size-mismatch'
    ? job
    : {
        kind: 'compared',
        baselineSize: job.baselineSize,
        actualSize: job.actualSize,
        resized: job.resized,
        result: {
          diffPixels: job.diffPixels,
          diffRatio: job.diffRatio,
          score: job.score,
        },
      };

/** The images of a comparison that the caller asked for. */
export const imagesOf = (
  job: JobResult,
  include: readonly ImagePart[],
): CompareResult['images'] =>
  job.kind === 'compared'
    ? {
        ...(include.includes('diff') && job.diffPng && { diff: job.diffPng }),
        ...(job.baselinePng && { baseline: job.baselinePng }),
        ...(job.actualPng && { actual: job.actualPng }),
      }
    : {};
