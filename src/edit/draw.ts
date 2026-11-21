import type { HighlightColor } from '../model/document';

/** Highlighter colours (see-through over the text). */
export const HIGHLIGHT: Record<HighlightColor, string> = {
  yellow: '#ffd600',
  green: '#4cd964',
  pink: '#ff6fae',
  blue: '#4fc3f7',
  orange: '#ffa726',
};
export const HIGHLIGHT_ALPHA = 0.35;
/** Line widths as fractions of the page width. */
export const PEN_FRAC = 0.004;
export const HIGHLIGHT_FRAC = 0.024;
/** Pen thickness steps (Cienkie / Średnie / Grube) as multiples of PEN_FRAC. */
export const PEN_WIDTH = { 1: 1, 2: 2, 3: 3.5 } as const;
export const penFrac = (width: 1 | 2 | 3 | undefined) => PEN_FRAC * PEN_WIDTH[width ?? 1];
/** Arrow head length as a fraction of the page width. */
export const HEAD_FRAC = 0.03;

/** Fewer points for a finger stroke (Ramer–Douglas–Peucker); both ends are kept. Flat [x0, y0, x1, y1, …]. */
export function simplify(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a * 2], ay = points[a * 2 + 1];
    const bx = points[b * 2], by = points[b * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let farD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = points[i * 2], py = points[i * 2 + 1];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

/** Tip and the two back corners of an arrow head at (x1, y1), coming from (x0, y0); pixels. */
export function arrowHead(x0: number, y0: number, x1: number, y1: number, size: number): Array<[number, number]> {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const spread = Math.PI / 7;
  return [
    [x1, y1],
    [x1 - size * Math.cos(a - spread), y1 - size * Math.sin(a - spread)],
    [x1 - size * Math.cos(a + spread), y1 - size * Math.sin(a + spread)],
  ];
}

/** Bounding box of a stroke (fractions). */
export function strokeBox(points: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]);
    x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]);
    y1 = Math.max(y1, points[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
