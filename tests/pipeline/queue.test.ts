import { describe, expect, it } from 'vitest';
import { runQueue } from '../../src/pipeline/queue';

describe('runQueue', () => {
  it('never exceeds the concurrency limit and processes everything', async () => {
    let active = 0;
    let peak = 0;
    let done = 0;
    await runQueue([...Array(10).keys()], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      done++;
    });
    expect(peak).toBe(2);
    expect(done).toBe(10);
  });

  it('stops starting new items after abort', async () => {
    const ac = new AbortController();
    const started: number[] = [];
    await runQueue(
      [...Array(10).keys()],
      1,
      async (i) => {
        started.push(i);
        if (i === 2) ac.abort();
      },
      ac.signal,
    );
    expect(started).toEqual([0, 1, 2]);
  });
});
