import { enhance, type ScanFilter } from '../scan/enhance';

/** Applies a page look to a rendered canvas in place (no-op for Kolor). */
export function applyCanvasFilter(canvas: HTMLCanvasElement, filter: ScanFilter | undefined): void {
  if (!filter || filter === 'color') return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !canvas.width || !canvas.height) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  enhance(img.data, canvas.width, canvas.height, filter);
  ctx.putImageData(img, 0, 0);
}
