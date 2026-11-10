import { loadEngine } from './engines';
import { cropToSame, decodePng, encodePng, padToSame } from './image';
import type {
  DiffEngine,
  EngineOptions,
  EngineResult,
  RgbaImage,
  SizeMismatch,
} from './types';

/** The CPU-bound part of one comparison: plain data in, plain data out, so it can run in a worker. */
export type CompareJob = {
  baseline: Uint8Array;
  actual: Uint8Array;
  onSizeMismatch: SizeMismatch;
  /** An engine id (see `loadEngine`), so a worker can load it itself. */
  engine: { id: string; options?: EngineOptions; cwd?: string };
};

type Size = { width: number; height: number };

export type JobResult =
  | {
      kind: 'compared';
      baselineSize: Size;
      actualSize: Size;
      resized?: 'pad' | 'crop';
      diffPixels: number;
      diffRatio: number;
      /** The diff image, already encoded. */
      diffPng?: Uint8Array;
      score?: EngineResult['score'];
    }
  | { kind: 'size-mismatch'; baselineSize: Size; actualSize: Size };

const decodeNamed = (which: string, bytes: Uint8Array) => {
  try {
    return decodePng(bytes);
  } catch (error) {
    throw new Error(`the ${which} image: ${(error as Error).message}`, {
      cause: error,
    });
  }
};

const sizeOf = ({ width, height }: RgbaImage): Size => ({ width, height });

export const runCompare = async (
  job: Pick<CompareJob, 'baseline' | 'actual' | 'onSizeMismatch'>,
  engine: DiffEngine,
): Promise<JobResult> => {
  let baseline = decodeNamed('baseline', job.baseline);
  let actual = decodeNamed('actual', job.actual);
  const baselineSize = sizeOf(baseline);
  const actualSize = sizeOf(actual);
  let resized: 'pad' | 'crop' | undefined;
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    if (job.onSizeMismatch === 'fail') {
      return { kind: 'size-mismatch', baselineSize, actualSize };
    }
    resized = job.onSizeMismatch;
    [baseline, actual] = (resized === 'pad' ? padToSame : cropToSame)(
      baseline,
      actual,
    );
  }
  const { diff, ...result } = await engine.compare(baseline, actual);
  return {
    kind: 'compared',
    baselineSize,
    actualSize,
    ...(resized && { resized }),
    ...result,
    ...(diff && { diffPng: encodePng(diff) }),
  };
};

/** Runs a job in this thread (what a worker does for each message). */
export const runJob = async (job: CompareJob): Promise<JobResult> =>
  runCompare(
    job,
    await loadEngine(job.engine.id, job.engine.options, job.engine.cwd),
  );
