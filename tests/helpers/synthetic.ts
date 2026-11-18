import type { GrayImage } from '../../src/imaging/gray';

/** All-white page (255). */
export function blankPage(width: number, height: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(255), width, height };
}

/**
 * Horizontal "text lines" (black bars with word gaps) on white, rotated about
 * the page centre by `skewDeg`. Positive = counter-clockwise on screen, i.e.
 * lines tilt visually up to the right. `estimateSkew` on the result returns
 * `angleDeg ~= -skewDeg` (the clockwise correction).
 */
export function syntheticTextPage(width: number, height: number, skewDeg: number): GrayImage {
  const data = new Uint8Array(width * height).fill(255);
  const rad = (skewDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  const margin = 50;
  const lineH = 10;
  const linePeriod = 22;
  const wordLen = 40;
  const wordPeriod = 48;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // inverse of a visual CCW rotation (y axis points down)
      const u = dx * c - dy * s + cx;
      const v = dx * s + dy * c + cy;
      if (u < margin || u >= width - margin || v < margin || v >= height - margin) continue;
      if ((v - margin) % linePeriod < lineH && (u - margin) % wordPeriod < wordLen) {
        data[y * width + x] = 0;
      }
    }
  }
  return { data, width, height };
}
