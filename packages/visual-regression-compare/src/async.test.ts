import { describe, expect, it } from 'vitest';
import { collect, mapLimit, once, pipe, runAll } from './async';

describe('async helpers', () => {
  it('pipe threads a value through sync and async steps', async () => {
    expect(
      await pipe(1, [(n) => n + 1, async (n) => n * 10, (n) => n - 5]),
    ).toBe(15);
    expect(await pipe('x', [])).toBe('x');
  });

  it('runAll awaits each function in order', async () => {
    const seen: string[] = [];
    await runAll(
      [
        async (s: string) => {
          await Promise.resolve();
          seen.push(`a${s}`);
        },
        (s: string) => void seen.push(`b${s}`),
      ],
      '1',
    );
    expect(seen).toEqual(['a1', 'b1']);
  });

  it('once runs the function once for every caller', async () => {
    let runs = 0;
    const run = once(async () => ++runs);
    expect(await Promise.all([run(), run(), run()])).toEqual([1, 1, 1]);
  });

  it('collect drains an async iterable', async () => {
    expect(
      await collect(
        (async function* () {
          yield 1;
          yield 2;
        })(),
      ),
    ).toEqual([1, 2]);
  });

  it('mapLimit runs at most `limit` at a time and reports every failure', async () => {
    let active = 0;
    let peak = 0;
    const failures = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (n % 2 === 0) throw new Error(`bad ${n}`);
    });
    expect(peak).toBe(2);
    expect(failures.map((f) => f.message).sort()).toEqual(['bad 2', 'bad 4']);
  });

  it('mapLimit copes with no items and a limit below one', async () => {
    expect(await mapLimit([], 4, async () => {})).toEqual([]);
    const seen: number[] = [];
    await mapLimit([1, 2], 0, async (n) => void seen.push(n));
    expect(seen).toEqual([1, 2]);
  });
});
