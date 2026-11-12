import { Worker } from 'worker_threads';
import { runJob, type CompareJob, type JobResult } from './job';

type Pending = {
  job: CompareJob;
  resolve: (result: JobResult) => void;
  reject: (error: Error) => void;
};

type Reply = { id: number; result?: JobResult; error?: string };

/**
 * Runs jobs in worker threads, one at a time per worker. With `size` 1 or no
 * worker file it runs them in this thread, so the same code path serves tests
 * and tiny runs.
 */
export class WorkerPool {
  private readonly idle: Worker[] = [];
  private readonly workers: Worker[] = [];
  private readonly queue: Pending[] = [];
  private readonly running = new Map<number, Pending>();
  private nextId = 0;
  private readonly current = new WeakMap<Worker, number>();

  constructor(
    private readonly size: number,
    private readonly workerFile: URL | string | undefined,
  ) {}

  get threaded() {
    return this.size > 1 && this.workerFile !== undefined;
  }

  run(job: CompareJob): Promise<JobResult> {
    if (!this.threaded) return runJob(job);
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    while (this.queue.length > 0) {
      const worker = this.idle.pop() ?? this.spawn();
      if (!worker) return;
      const pending = this.queue.shift() as Pending;
      const id = this.nextId++;
      this.running.set(id, pending);
      this.current.set(worker, id);
      worker.postMessage({ id, job: pending.job });
    }
  }

  private spawn(): Worker | undefined {
    if (this.workers.length >= this.size) return undefined;
    const worker = new Worker(this.workerFile as URL | string);
    this.workers.push(worker);
    worker.on('message', ({ id, result, error }: Reply) => {
      const pending = this.running.get(id);
      this.running.delete(id);
      this.idle.push(worker);
      if (error !== undefined) pending?.reject(new Error(error));
      else pending?.resolve(result as JobResult);
      this.pump();
    });
    // a worker that dies, with or without an error event (`process.exit` in an
    // engine), is forgotten and fails the job it was running
    const lose = (error: Error) => {
      for (const list of [this.workers, this.idle]) {
        const at = list.indexOf(worker);
        if (at !== -1) list.splice(at, 1);
      }
      const id = this.current.get(worker);
      const pending = id === undefined ? undefined : this.running.get(id);
      if (id !== undefined) this.running.delete(id);
      pending?.reject(error);
      this.pump();
    };
    worker.on('exit', (code) =>
      lose(new Error(`A compare worker exited with code ${code}`)),
    );
    worker.on('error', lose);
    return worker;
  }

  async close() {
    for (const pending of this.running.values()) {
      pending.reject(new Error('The compare worker pool was closed'));
    }
    this.running.clear();
    this.queue.length = 0;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
    this.workers.length = 0;
    this.idle.length = 0;
  }
}
