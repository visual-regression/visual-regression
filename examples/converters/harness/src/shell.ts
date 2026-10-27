import { spawn } from 'node:child_process';
import path from 'node:path';

export type ShOptions = {
  cwd: string;
  /** Added to the environment; `undefined` removes a variable. */
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
};
export type ShResult = { status: number | null; output: string };

/**
 * Runs a command (a path is resolved against `cwd`) and resolves with its
 * exit status and combined output. Rejects on a non-zero exit unless allowed:
 * a failing comparison is the expected outcome of most compare runs. It is
 * asynchronous so that a server the harness runs stays responsive meanwhile.
 */
export const sh = (
  cmd: string,
  args: string[],
  { cwd, env = {}, allowFailure = false }: ShOptions,
): Promise<ShResult> => {
  const file = cmd.includes('/') ? path.resolve(cwd, cmd) : cmd;
  const shown = [cmd, ...args].join(' ');
  const vars = Object.entries(env)
    .map(([k, v]) => `${k}=${v ?? ''}`)
    .join(' ');
  console.log(`$ ${vars ? `${vars} ` : ''}${shown}`);
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) {
    if (v !== undefined) merged[k] = v;
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(file, args, {
      cwd,
      env: merged,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      const output = Buffer.concat(chunks).toString('utf8');
      if (status !== 0 && !allowFailure) {
        reject(new Error(`${shown} exited with ${status}:\n${output}`));
      } else {
        resolve({ status, output });
      }
    });
  });
};
