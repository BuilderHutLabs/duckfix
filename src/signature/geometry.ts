import type { Stamp } from '../model/document';

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Copy of a rectangle of RGBA pixels (the rectangle is clamped to the image). */
export function cropRgba(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  r: PxRect,
): { data: Uint8ClampedArray; width: number; height: number } {
  const x0 = Math.max(0, Math.min(w - 1, Math.round(r.x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.round(r.y)));
  const x1 = Math.max(x0 + 1, Math.min(w, Math.round(r.x + r.w)));
  const y1 = Math.max(y0 + 1, Math.min(h, Math.round(r.y + r.h)));
  const cw = x1 - x0;
  const ch = y1 - y0;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(d.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1) * 4), y * cw * 4);
  return { data: out, width: cw, height: ch };
}

/** Starting crop frame: where the ink is, plus a margin (fraction of the photo's longer side). */
export function inkBox(d: Uint8ClampedArray, w: number, h: number, margin: number): PxRect | null {
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
  const m = Math.round(margin * Math.max(w, h));
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Angle in (-180, 180], snapped to 0/90/180/-90 when within 6°. */
export function snapAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) <= 6) a = s;
  if (a === -180) a = 180;
  return Math.round(a * 10) / 10 || 0; // no -0
}

/**
 * pdf-lib drawImage options for a signature: the box is in fractions of the page (origin top-left)
 * and turns clockwise by `rot` around its own centre; pdf-lib rotates counter-clockwise around the
 * image's bottom-left corner, so that corner is moved to keep the centre in place.
 */
export function stampPdfPlacement(
  s: Pick<Stamp, 'x' | 'y' | 'w' | 'h' | 'rot'>,
  pageW: number,
  pageH: number,
): { x: number; y: number; width: number; height: number; rotate: number } {
  const width = s.w * pageW;
  const height = s.h * pageH;
  const cx = (s.x + s.w / 2) * pageW;
  const cy = (1 - s.y - s.h / 2) * pageH;
  const rotate = s.rot ? -s.rot : 0;
  const t = (rotate * Math.PI) / 180;
  const hw = width / 2;
  const hh = height / 2;
  return {
    x: cx - (hw * Math.cos(t) - hh * Math.sin(t)),
    y: cy - (hw * Math.sin(t) + hh * Math.cos(t)),
    width,
    height,
    rotate,
  };
}

export type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

/** The crop frame after dragging a corner (or the middle) by dx, dy pixels of the photo. */
export function dragCrop(r: PxRect, handle: CropHandle, dx: number, dy: number, w: number, h: number, min = 10): PxRect {
  if (handle === 'move') {
    return { x: Math.max(0, Math.min(w - r.w, r.x + dx)), y: Math.max(0, Math.min(h - r.h, r.y + dy)), w: r.w, h: r.h };
  }
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (handle === 'nw' || handle === 'sw') x0 = Math.max(0, Math.min(x1 - min, x0 + dx));
  else x1 = Math.min(w, Math.max(x0 + min, x1 + dx));
  if (handle === 'nw' || handle === 'ne') y0 = Math.max(0, Math.min(y1 - min, y0 + dy));
  else y1 = Math.min(h, Math.max(y0 + min, y1 + dy));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
