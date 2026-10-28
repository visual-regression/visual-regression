import { spawnSync } from 'node:child_process';
import path from 'node:path';

export type ShOptions = {
  cwd: string;
  /** Added to the environment; `undefined` removes a variable. */
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
};
export type ShResult = { status: number | null; output: string };

/**
 * Runs a command (a path is resolved against `cwd`) and returns its exit
 * status and combined output. Throws on a non-zero exit unless allowed:
 * a failing comparison is the expected outcome of most compare runs.
 */
export const sh = (
  cmd: string,
  args: string[],
  { cwd, env = {}, allowFailure = false }: ShOptions,
): ShResult => {
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
  const result = spawnSync(file, args, {
    cwd,
    env: merged,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${shown} exited with ${result.status}:\n${output}`);
  }
  return { status: result.status, output };
};
