import { useSyncExternalStore } from 'react';

/**
 * Where a finger is dragging something on the page (screen pixels), for the magnifier that shows
 * what the finger covers. A mouse or pen does not cover anything: no magnifier for them.
 */
let point: { x: number; y: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function loupeAt(e: { clientX: number; clientY: number; pointerType?: string }): void {
  if (e.pointerType !== 'touch') return;
  point = { x: e.clientX, y: e.clientY };
  emit();
}

export function loupeOff(): void {
  if (!point) return;
  point = null;
  emit();
}

export function useLoupePoint(): { x: number; y: number } | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => point,
  );
}

/** Size of the magnifier (px), how much it magnifies, and how far above the finger it floats. */
export const LOUPE = { size: 112, zoom: 2.2, lift: 76 };

/** Top-left of the magnifier for a finger at (x, y) in a box w wide: above the finger, below it near the top. */
export function loupeSpot(x: number, y: number, w: number): { left: number; top: number } {
  const s = LOUPE.size;
  const left = Math.min(Math.max(x - s / 2, 4), Math.max(4, w - s - 4));
  const above = y - LOUPE.lift - s;
  return { left, top: above >= 4 ? above : y + LOUPE.lift };
}
