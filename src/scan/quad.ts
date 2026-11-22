import { MAX_CANVAS_PIXELS } from '../export/rasterize';

export type Pt = { x: number; y: number };
/** Sheet corners in reading order: top-left, top-right, bottom-right, bottom-left (pixels). */
export type Quad = [Pt, Pt, Pt, Pt];

/** The whole photo ("Całe zdjęcie", and photos taken in "Ręcznie"). */
export function fullQuad(w: number, h: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/** Photo inset by 8 % on each side: the starting frame when the sheet is not found. */
export function defaultQuad(w: number, h: number): Quad {
  const dx = Math.round(w * 0.08);
  const dy = Math.round(h * 0.08);
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

/** Solves A·x = b (n×n, Gaussian elimination with partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / d;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** 3×3 projective transform (row-major, h[8] = 1) taking each `from` corner to the `to` corner. */
export function homography(from: Quad, to: Quad): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function applyHomography(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Size of the straightened sheet: average opposite edges, long side ≤ maxSide, area ≤ the canvas limit. */
export function warpSize(q: Quad, maxSide = 2400): { w: number; h: number } {
  let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  let h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const k = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
  w *= k;
  h *= k;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}
