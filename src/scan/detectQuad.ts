import { otsuThreshold, type GrayImage } from '../imaging/gray';
import type { Pt, Quad } from './quad';

/**
 * Finding the sheet of paper in a small (≤ ~400 px) photo.
 *
 * Candidates come from two sources: straight edges (a Hough transform over the edge pixels; the sheet's
 * four sides are long straight lines, folds of clothes and wood grain mostly are not), and the old
 * bright-region split (good on plain tables). Every candidate is then scored the same way: each of the
 * four sides must lie on a real edge along its whole length, and the inside must be lighter / whiter
 * than the band just outside it. The best candidate wins; none good enough gives null.
 */

/** The sheet must cover at least this share of the photo. */
const MIN_AREA = 0.12;
/** A side must lie on an edge for at least this share of its length. */
const MIN_SIDE = 0.45;
/** The best candidate needs at least this score. */
const MIN_SCORE = 0.42;

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

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

/** Separable box blur of radius r (edges clamped) over a float map; a running sum per row / column. */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

interface Maps {
  w: number;
  h: number;
  /** blurred brightness */
  lum: Float32Array;
  /** blurred "paper-ness": bright in every colour channel and not colourful (white / grey paper) */
  paper: Float32Array;
  /** edge pixels after thinning */
  edge: Uint8Array;
  /** gradient direction at each pixel (radians) */
  dir: Float32Array;
}

function buildMaps(img: GrayImage, rgba?: ArrayLike<number>): Maps {
  const { width: w, height: h } = img;
  const n = w * h;
  const lum0 = new Float32Array(n);
  const paper0 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum0[i] = img.data[i];
    if (rgba) {
      const r = rgba[i * 4],
        g = rgba[i * 4 + 1],
        b = rgba[i * 4 + 2];
      const lo = Math.min(r, g, b);
      const hi = Math.max(r, g, b);
      paper0[i] = lo - 0.5 * (hi - lo);
    } else paper0[i] = img.data[i];
  }
  const lum = blur(blur(lum0, w, h, 1), w, h, 1);
  const paper = blur(paper0, w, h, 1);

  // Sobel on brightness and on paper-ness (the stronger of the two), then thinning
  const mag = new Float32Array(n);
  const dir = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const ly = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      const px = paper[i - w + 1] + 2 * paper[i + 1] + paper[i + w + 1] - paper[i - w - 1] - 2 * paper[i - 1] - paper[i + w - 1];
      const py = paper[i + w - 1] + 2 * paper[i + w] + paper[i + w + 1] - paper[i - w - 1] - 2 * paper[i - w] - paper[i - w + 1];
      const gl = lx * lx + ly * ly;
      const gp = px * px + py * py;
      if (gl >= gp) {
        mag[i] = Math.sqrt(gl);
        dir[i] = gl ? Math.atan2(ly, lx) : 0;
      } else {
        mag[i] = Math.sqrt(gp);
        dir[i] = Math.atan2(py, px);
      }
    }
  }
  // threshold: the strongest ~12 % of gradients, never below a floor (noise)
  const BINS = 2048;
  const hist = new Uint32Array(BINS);
  for (let i = 0; i < n; i++) hist[Math.min(BINS - 1, mag[i] >> 0)]++;
  let seen = 0;
  let p88 = 0;
  for (; p88 < BINS && seen < n * 0.88; p88++) seen += hist[p88];
  const thr = Math.max(40, p88);
  const edge = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const g = mag[i];
      if (g < thr) continue;
      const a = dir[i];
      const dx = Math.round(Math.cos(a));
      const dy = Math.round(Math.sin(a));
      if (g >= mag[i + dy * w + dx] && g >= mag[i - dy * w - dx]) edge[i] = 1;
    }
  }
  return { w, h, lum, paper, edge, dir };
}

interface Line {
  /** x·cos t + y·sin t = r */
  t: number;
  r: number;
}

/** Strongest straight lines of the edge map (each edge pixel votes only near its own direction). */
function houghLines(m: Maps, max: number): Line[] {
  const { w, h, edge, dir } = m;
  const T = 180;
  const diag = Math.ceil(Math.hypot(w, h));
  const R = 2 * diag + 1;
  const acc = new Uint16Array(T * R);
  const cos = new Float32Array(T);
  const sin = new Float32Array(T);
  for (let k = 0; k < T; k++) {
    cos[k] = Math.cos((k * Math.PI) / T);
    sin[k] = Math.sin((k * Math.PI) / T);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!edge[i]) continue;
      let a = dir[i];
      if (a < 0) a += Math.PI;
      const k0 = Math.round((a * T) / Math.PI);
      for (let d = -6; d <= 6; d++) {
        const k = (((k0 + d) % T) + T) % T;
        const r = Math.round(x * cos[k] + y * sin[k]) + diag;
        acc[k * R + r]++;
      }
    }
  }
  // peaks, with the neighbourhood of each taken peak cleared
  const lines: Line[] = [];
  const minVotes = Math.max(12, 0.12 * Math.min(w, h));
  for (let n = 0; n < max; n++) {
    let best = 0,
      bi = -1;
    for (let i = 0; i < acc.length; i++) {
      if (acc[i] > best) {
        best = acc[i];
        bi = i;
      }
    }
    if (bi < 0 || best < minVotes) break;
    const k = Math.floor(bi / R);
    const r = (bi % R) - diag;
    lines.push({ t: (k * Math.PI) / T, r });
    for (let dk = -5; dk <= 5; dk++) {
      const kk = (((k + dk) % T) + T) % T;
      // across the 0/180° seam the line's r changes sign
      const rr = k + dk < 0 || k + dk >= T ? -r : r;
      for (let dr = -6; dr <= 6; dr++) {
        const ri = rr + dr + diag;
        if (ri >= 0 && ri < R) acc[kk * R + ri] = 0;
      }
    }
  }
  return lines;
}

function meet(a: Line, b: Line): Pt | null {
  const ca = Math.cos(a.t),
    sa = Math.sin(a.t),
    cb = Math.cos(b.t),
    sb = Math.sin(b.t);
  const det = ca * sb - sa * cb;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.r * sb - b.r * sa) / det, y: (ca * b.r - cb * a.r) / det };
}

/** Angle between two lines, 0…90°. */
function angleBetween(a: Line, b: Line): number {
  let d = Math.abs(a.t - b.t) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
}

/** Quads made of two roughly parallel line pairs crossing each other. */
function lineQuads(lines: Line[], w: number, h: number): Quad[] {
  const pairs: Array<[Line, Line]> = [];
  const minGap = 0.2 * Math.min(w, h);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j];
      if (angleBetween(a, b) > 30) continue;
      // distance between the two lines at the photo centre
      const da = Math.abs((w / 2) * Math.cos(a.t) + (h / 2) * Math.sin(a.t) - a.r);
      const db = Math.abs((w / 2) * Math.cos(b.t) + (h / 2) * Math.sin(b.t) - b.r);
      const same = Math.cos(a.t - b.t) > 0;
      const sa = (w / 2) * Math.cos(a.t) + (h / 2) * Math.sin(a.t) - a.r;
      const sb = (w / 2) * Math.cos(b.t) + (h / 2) * Math.sin(b.t) - b.r;
      const gap = same === Math.sign(sa) * Math.sign(sb) < 0 ? da + db : Math.abs(da - db);
      if (gap >= minGap) pairs.push([a, b]);
    }
  }
  const out: Quad[] = [];
  const margin = 0.06 * Math.max(w, h);
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, a2] = pairs[i];
      const [b1, b2] = pairs[j];
      if (angleBetween(a1, b1) < 45 || angleBetween(a2, b2) < 45) continue;
      const pts = [meet(a1, b1), meet(b1, a2), meet(a2, b2), meet(b2, a1)];
      if (pts.some((p) => !p || p.x < -margin || p.y < -margin || p.x > w + margin || p.y > h + margin)) continue;
      const q = order(pts as Pt[]);
      if (isConvex(q) && area(q) >= MIN_AREA * w * h)
        out.push(q.map((p) => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) })) as Quad);
    }
  }
  return out;
}

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

/** Four hull points enclosing the largest area: seeded by the x±y extremes, then refined. */
function bestQuad(h: Pt[]): Quad | null {
  if (h.length < 4) return null;
  const pick = (f: (p: Pt) => number, max: boolean) => h.reduce((b, p) => ((max ? f(p) > f(b) : f(p) < f(b)) ? p : b), h[0]);
  const q = [pick((p) => p.x + p.y, false), pick((p) => p.x - p.y, true), pick((p) => p.x + p.y, true), pick((p) => p.x - p.y, false)];
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

/** Bright regions (Otsu split of brightness and of paper-ness): their 4-corner fit. */
function regionQuads(m: Maps): Quad[] {
  const { w, h } = m;
  const n = w * h;
  const out: Quad[] = [];
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const data = new Uint8Array(n);
  for (const map of [m.lum, m.paper]) {
    for (let i = 0; i < n; i++) data[i] = map[i] < 0 ? 0 : map[i] > 255 ? 255 : map[i];
    const t = otsuThreshold({ data, width: w, height: h });
    label.fill(0);
    const sizes: number[] = [0];
    let id = 0;
    for (let start = 0; start < n; start++) {
      if (label[start] || data[start] < t) continue;
      id++;
      let count = 0;
      let top = 0;
      stack[top++] = start;
      label[start] = id;
      while (top) {
        const i = stack[--top];
        count++;
        const x = i % w;
        if (x > 0 && !label[i - 1] && data[i - 1] >= t) {
          label[i - 1] = id;
          stack[top++] = i - 1;
        }
        if (x < w - 1 && !label[i + 1] && data[i + 1] >= t) {
          label[i + 1] = id;
          stack[top++] = i + 1;
        }
        if (i >= w && !label[i - w] && data[i - w] >= t) {
          label[i - w] = id;
          stack[top++] = i - w;
        }
        if (i + w < n && !label[i + w] && data[i + w] >= t) {
          label[i + w] = id;
          stack[top++] = i + w;
        }
      }
      sizes.push(count);
    }
    for (let r = 1; r <= id; r++) {
      if (sizes[r] < MIN_AREA * n) continue;
      const pts: Pt[] = [];
      for (let y = 0; y < h; y++) {
        let a = -1;
        let b = -1;
        for (let x = 0, i = y * w; x < w; x++, i++) {
          if (label[i] === r) {
            if (a < 0) a = x;
            b = x;
          }
        }
        if (a >= 0) pts.push({ x: a, y }, { x: b + 1, y }, { x: a, y: y + 1 }, { x: b + 1, y: y + 1 });
      }
      const q = bestQuad(hull(pts));
      if (q && isConvex(q)) out.push(q);
    }
  }
  return out;
}

const sample = (map: Float32Array, w: number, h: number, x: number, y: number) =>
  map[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];

/**
 * How well one side a→b is a sheet edge (0…1): share of its length lying on an edge pixel running
 * along it, times how much lighter / whiter the inside is than the outside. `inward` is the unit
 * normal pointing into the sheet.
 */
function sideScore(m: Maps, a: Pt, b: Pt, inward: Pt, stride: number): number {
  const { w, h, edge, dir } = m;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(8, Math.round(len / stride));
  let hits = 0,
    used = 0,
    diff = 0;
  const along = Math.atan2(inward.y, inward.x);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    // a side lying on the photo border cannot show an edge there; count it as half
    if (x < 2 || y < 2 || x > w - 3 || y > h - 3) {
      used++;
      hits += 0.5;
      continue;
    }
    used++;
    let hit = false;
    for (let d = -2; d <= 2 && !hit; d++) {
      const px = Math.round(x + inward.x * d);
      const py = Math.round(y + inward.y * d);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (!edge[i]) continue;
      let da = Math.abs(dir[i] - along) % Math.PI;
      if (da > Math.PI / 2) da = Math.PI - da;
      if (da < 0.45) hit = true;
    }
    if (hit) hits++;
    else if ((used - hits) / (steps - 1) > 1 - MIN_SIDE) return 0; // too many misses already
    const inL = sample(m.lum, w, h, x + inward.x * 4, y + inward.y * 4);
    const outL = sample(m.lum, w, h, x - inward.x * 4, y - inward.y * 4);
    const inP = sample(m.paper, w, h, x + inward.x * 4, y + inward.y * 4);
    const outP = sample(m.paper, w, h, x - inward.x * 4, y - inward.y * 4);
    diff += Math.max(inL - outL, inP - outP);
  }
  const support = used ? hits / used : 0;
  const contrast = Math.max(0, Math.min(1, diff / Math.max(1, steps - 1) / 30));
  return support < MIN_SIDE ? 0 : support * (0.35 + 0.65 * contrast);
}

function score(m: Maps, q: Quad, stride = 1): number {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const sides = q.map((a, i) => {
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return sideScore(m, a, b, { x: nx, y: ny }, stride);
  });
  const worst = Math.min(...sides);
  if (worst === 0) return 0;
  const mean = sides.reduce((s, v) => s + v, 0) / 4;
  // a little preference for bigger sheets (the inner boxes of a form are sheets too, in a way)
  const share = area(q) / (m.w * m.h);
  return mean * (0.6 + 0.4 * worst) * (0.75 + 0.25 * Math.min(1, share / 0.5));
}

/**
 * Finds the sheet of paper in a (downscaled, ≤ ~400 px) photo. `rgba` (the same pixels in colour)
 * helps tell white paper from a light wooden desk. Returns null when no convincing sheet is found;
 * the crop screen then starts from defaultQuad.
 */
export function detectQuad(img: GrayImage, rgba?: ArrayLike<number>): Quad | null {
  const m = buildMaps(img, rgba);
  const candidates = [...lineQuads(houghLines(m, 14), m.w, m.h), ...regionQuads(m)];
  // a quick look at every candidate (every 3rd pixel of each side), then a close look at the best few
  const rough = candidates
    .map((q) => ({ q, s: score(m, q, 3) }))
    .filter((c) => c.s > MIN_SCORE * 0.7)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);
  let best: Quad | null = null;
  let bestScore = MIN_SCORE;
  for (const { q } of rough) {
    const s = score(m, q);
    if (s > bestScore) {
      bestScore = s;
      best = q;
    }
  }
  return best;
}
