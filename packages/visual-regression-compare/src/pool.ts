import { Worker } from 'worker_threads';
import { runJob, type CompareJob, type JobResult } from './job';

type Pending = {
  job: CompareJob;
  resolve: (result: JobResult) => void;
  reject: (error: Error) => void;
};

type Reply = { id: number; result?: JobResult; error?: string };

export type WorkerPool = {
  /** Whether jobs leave the calling thread. */
  readonly threaded: boolean;
  run(job: CompareJob): Promise<JobResult>;
  close(): Promise<void>;
};

/**
 * Runs jobs in worker threads, one at a time per worker. With a `size` of 1,
 * or no worker file, it runs them in this thread, so the same code path serves
 * tests and tiny runs.
 */
export const createWorkerPool = (
  size: number,
  workerFile: URL | string | undefined,
): WorkerPool => {
  const workers = new Set<Worker>();
  const idle: Worker[] = [];
  const queue: Pending[] = [];
  const running = new Map<number, Pending>();
  const current = new WeakMap<Worker, number>();
  let nextId = 0;

  const forget = (worker: Worker) => {
    workers.delete(worker);
    const at = idle.indexOf(worker);
    if (at !== -1) idle.splice(at, 1);
  };

  const spawn = (): Worker | undefined => {
    if (workers.size >= size) return undefined;
    const worker = new Worker(workerFile as URL | string);
    workers.add(worker);
    worker.on('message', ({ id, result, error }: Reply) => {
      const pending = running.get(id);
      running.delete(id);
      idle.push(worker);
      if (error !== undefined) pending?.reject(new Error(error));
      else pending?.resolve(result as JobResult);
      pump();
    });
    // a worker that dies, with or without an error event (`process.exit` in an
    // engine), is forgotten and fails the job it was running
    const lose = (error: Error) => {
      forget(worker);
      const id = current.get(worker);
      const pending = id === undefined ? undefined : running.get(id);
      if (id !== undefined) running.delete(id);
      pending?.reject(error);
      pump();
    };
    worker.on('exit', (code) =>
      lose(new Error(`A compare worker exited with code ${code}`)),
    );
    worker.on('error', lose);
    return worker;
  };

  const pump = () => {
    while (queue.length > 0) {
      const worker = idle.pop() ?? spawn();
      if (!worker) return;
      const pending = queue.shift() as Pending;
      const id = nextId++;
      running.set(id, pending);
      current.set(worker, id);
      worker.postMessage({ id, job: pending.job });
    }
  };

  const threaded = size > 1 && workerFile !== undefined;

  return {
    threaded,
    run: (job) =>
      threaded
        ? new Promise((resolve, reject) => {
            queue.push({ job, resolve, reject });
            pump();
          })
        : runJob(job),
    async close() {
      running.forEach(({ reject }) =>
        reject(new Error('The compare worker pool was closed')),
      );
      running.clear();
      queue.length = 0;
      await Promise.all([...workers].map((worker) => worker.terminate()));
      workers.clear();
      idle.length = 0;
    },
  };
};
