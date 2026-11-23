/**
 * Older, weaker phones (few cores or little memory, e.g. a Redmi 7) get a lighter app: a smaller
 * live camera picture, fewer effects. A new phone sees no difference.
 */
export function isWeakDevice(nav: { hardwareConcurrency?: number; deviceMemory?: number } = navigator as never): boolean {
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory; // GB, rounded down by the browser (Chrome only)
  return cores <= 4 || (memory !== undefined && memory <= 2);
}

/** Marks the page for the lighter look (no blurs, no drifting colours) on a weak phone. */
export function markWeakDevice(): void {
  try {
    if (isWeakDevice()) document.documentElement.classList.add('weak');
  } catch {
    /* no document (tests) */
  }
}

/**
 * Time until the next look for the sheet in the live camera picture: at least 200 ms, and about
 * three times as long as the last look took, so a slow phone still shows a smooth picture; at
 * most a second.
 */
export function nextLookDelay(lastLookMs: number): number {
  return Math.round(Math.min(1000, Math.max(200, lastLookMs * 3)));
}

/**
 * A function run at most once per screen frame, with the latest arguments (finger moves come far
 * more often than the screen redraws). `flush` runs a pending call at once (the finger is lifted).
 */
export function rafThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
  raf: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let pending: A | null = null;
  let asked = false;
  const run = () => {
    asked = false;
    if (!pending) return;
    const args = pending;
    pending = null;
    fn(...args);
  };
  const call = (...args: A) => {
    pending = args;
    if (!asked) {
      asked = true;
      raf(run);
    }
  };
  call.flush = () => {
    if (!pending) return;
    const args = pending;
    pending = null;
    fn(...args);
  };
  call.cancel = () => {
    pending = null;
  };
  return call;
}
