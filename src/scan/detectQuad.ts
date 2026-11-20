import { otsuThreshold, type GrayImage } from '../imaging/gray';
import type { Pt, Quad } from './quad';

/** The sheet must cover at least this share of the photo. */
const MIN_AREA = 0.2;
/** Paper and background must differ by this many grey levels to trust the split. */
const MIN_CONTRAST = 30;

/** Separable box blur of radius r (edges clamped). */
function boxBlur(img: GrayImage, r: number): GrayImage {
  const { width: w, height: h } = img;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += img.data[row + Math.min(w - 1, Math.max(0, x + k))];
      tmp[row + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = Math.round(s / n);
    }
  }
  return { data: out, width: w, height: h };
}

/** Mean grey below and at/above the threshold; null when one side is empty. */
function classMeans(img: GrayImage, t: number): [number, number] | null {
  let lo = 0, nLo = 0, hi = 0, nHi = 0;
  for (const v of img.data) {
    if (v < t) { lo += v; nLo++; } else { hi += v; nHi++; }
  }
  return nLo && nHi ? [lo / nLo, hi / nHi] : null;
}

/** Leftmost and rightmost pixel per row of the largest 4-connected region on the chosen side. */
function largestRegion(img: GrayImage, t: number, bright: boolean): { count: number; edge: Pt[] } | null {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h);
  const on = (i: number) => (data[i] >= t) === bright;
  const stack = new Int32Array(w * h);
  let best = { id: 0, count: 0 };
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] || !on(start)) continue;
    id++;
    let count = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top) {
      const i = stack[--top];
      count++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) {
        if (j >= 0 && j < w * h && !label[j] && on(j)) {
          label[j] = id;
          stack[top++] = j;
        }
      }
    }
    if (count > best.count) best = { id, count };
  }
  if (!best.count) return null;
  const edge: Pt[] = [];
  for (let y = 0; y < h; y++) {
    let minX = -1, maxX = -1;
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] === best.id) {
        if (minX < 0) minX = x;
        maxX = x;
      }
    }
    if (minX >= 0) edge.push({ x: minX, y }, { x: maxX + 1, y }, { x: minX, y: y + 1 }, { x: maxX + 1, y: y + 1 });
  }
  return { count: best.count, edge };
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (monotone chain). */
function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function area(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function isConvex(q: Quad): boolean {
  const signs = q.map((_, i) => Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])));
  return signs.every((s) => s !== 0 && s === signs[0]);
}

/** Reading order: clockwise on screen, starting at the corner nearest the top-left. */
function order(q: Pt[]): Quad {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const byAngle = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let first = 0;
  byAngle.forEach((p, i) => {
    if (p.x + p.y < byAngle[first].x + byAngle[first].y) first = i;
  });
  return [0, 1, 2, 3].map((k) => byAngle[(first + k) % 4]) as Quad;
}

/** Four hull points enclosing the largest area: seeded by the x±y extremes, then refined. */
function bestQuad(h: Pt[]): Quad | null {
  if (h.length < 4) return null;
  const pick = (f: (p: Pt) => number, max: boolean) =>
    h.reduce((b, p) => ((max ? f(p) > f(b) : f(p) < f(b)) ? p : b), h[0]);
  const q = [
    pick((p) => p.x + p.y, false),
    pick((p) => p.x - p.y, true),
    pick((p) => p.x + p.y, true),
    pick((p) => p.x - p.y, false),
  ];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 4; i++) {
      let bestA = area(q);
      for (const p of h) {
        const trial = q.map((c, k) => (k === i ? p : c));
        const a = area(order(trial));
        if (a > bestA) {
          bestA = a;
          q[i] = p;
        }
      }
    }
  }
  return order(q);
}

/**
 * Finds the sheet of paper in a (downscaled, ≤ ~400 px) grey photo: blur, split paper from the
 * background (Otsu), take the largest region, its convex hull, and the 4-corner fit. Returns null
 * when no convincing sheet is found; the crop screen then starts from defaultQuad.
 */
export function detectQuad(img: GrayImage): Quad | null {
  const g = boxBlur(boxBlur(img, 2), 2);
  const t = otsuThreshold(g);
  const means = classMeans(g, t);
  if (!means || means[1] - means[0] < MIN_CONTRAST) return null;
  const minArea = MIN_AREA * img.width * img.height;
  // paper is usually brighter than the table; try the darker side once if not
  for (const bright of [true, false]) {
    const region = largestRegion(g, t, bright);
    if (!region || region.count < minArea) continue;
    const q = bestQuad(hull(region.edge));
    // a dark region filling the frame is the table around a small sheet, not a dark sheet
    const tooBig = !bright && q !== null && area(q) > 0.95 * img.width * img.height;
    if (q && isConvex(q) && area(q) >= minArea && !tooBig) return q;
  }
  return null;
}
