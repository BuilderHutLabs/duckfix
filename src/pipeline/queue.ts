/** Runs `fn` over `items` with at most `concurrency` in flight. Abort stops starting new items. */
export async function runQueue<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !signal?.aborted) {
      await fn(items[next++]);
    }
  };
  const n = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  await Promise.all(Array.from({ length: n }, worker));
}
