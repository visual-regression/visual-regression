import { parentPort } from 'worker_threads';
import { runJob, type CompareJob } from './job';

parentPort?.on(
  'message',
  async ({ id, job }: { id: number; job: CompareJob }) => {
    try {
      parentPort?.postMessage({ id, result: await runJob(job) });
    } catch (error) {
      parentPort?.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
