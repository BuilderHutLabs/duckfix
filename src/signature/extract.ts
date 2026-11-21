import { enhance } from '../scan/enhance';

/**
 * Turns a photo of a signature on paper into ink on a transparent background (RGBA, new buffer).
 * The lighting is evened out first (same as "Wybielony"), so shadows on the paper do not count as
 * ink; then darkness becomes opacity and the ink keeps its own colour (blue pen stays blue).
 */
export function extractInk(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const d = src.slice();
  enhance(d, w, h, 'whiten');
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    // paper (>= 200) fully transparent, real ink (<= 110) fully opaque, smooth edges in between
    const a = Math.max(0, Math.min(255, ((200 - lum) * 255) / 90));
    if (a > 0) {
      // deepen the colour a little: a photographed pen line is lighter than on paper
      const k = 0.75;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
    d[i + 3] = a;
  }
  return d;
}

/** Crops transparent RGBA to the ink plus a small margin; null when nothing is written. */
export function trimToInk(
  d: Uint8ClampedArray,
  w: number,
  h: number,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 60) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const m = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.04));
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    out.set(d.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + tw) * 4), y * tw * 4);
  }
  return { data: out, width: tw, height: th };
}
