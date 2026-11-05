import type { FromWorker, Options, Padding, ToWorker } from '../types';

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
type Loaded = Extract<FromWorker, { type: 'loaded' }>;
type Result = Extract<FromWorker, { type: 'result' }>['result'];

interface Pending {
  resolve: (value: FromWorker) => void;
  reject: (reason: Error) => void;
}

/** Promise interface over the worker; a new load while it is busy restarts it */
export class DiffWorker {
  #worker!: Worker;
  #pending = new Map<number, Pending>();
  #token = 0;

  constructor() {
    this.#start();
  }

  #start() {
    this.#worker = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    });
    this.#worker.addEventListener(
      'message',
      (event: MessageEvent<FromWorker>) => {
        const pending = this.#pending.get(event.data.token);
        if (!pending) return;
        this.#pending.delete(event.data.token);
        if (event.data.type === 'error') {
          pending.reject(new Error(event.data.message));
        } else {
          pending.resolve(event.data);
        }
      },
    );
    this.#worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'The worker crashed');
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    });
  }

  #send(message: DistributiveOmit<ToWorker, 'token'>): Promise<FromWorker> {
    const token = ++this.#token;
    return new Promise((resolve, reject) => {
      this.#pending.set(token, { resolve, reject });
      this.#worker.postMessage({ ...message, token });
    });
  }

  /** drops whatever is queued; a fresh pair makes the old work pointless */
  restart() {
    this.#worker.terminate();
    const stale = new Error('Replaced by a new pair of images');
    for (const pending of this.#pending.values()) pending.reject(stale);
    this.#pending.clear();
    this.#start();
  }

  async load(a: Blob, b: Blob, padding: Padding): Promise<Loaded> {
    if (this.#pending.size) this.restart();
    return (await this.#send({ type: 'load', a, b, padding })) as Loaded;
  }

  async run(engine: string, options: Options): Promise<Result> {
    const message = await this.#send({ type: 'run', engine, options });
    return (message as Extract<FromWorker, { type: 'result' }>).result;
  }
}
