/**
 * "Paragon": a long receipt photographed in parts, top to bottom, each with a little overlap. The
 * straightened parts are brought to one width and put one under the other; the rows both photos
 * show are found and shown once.
 */

/** Columns each row is summed into: enough to tell one line of print from another. */
const BINS = 24;

/** Per row of a grey picture (w × h), how dark each of BINS columns is (0 = paper). */
export function rowFeatures(gray: Uint8ClampedArray, w: number, h: number): Float32Array {
  const f = new Float32Array(h * BINS);
  const per = w / BINS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = Math.min(BINS - 1, Math.floor(x / per));
      f[y * BINS + b] += (255 - gray[y * w + x]) / per;
    }
  }
  return f;
}

/**
 * How many top rows of the next part repeat the bottom rows of the previous one (same scale, rows of
 * rowFeatures); 0 when nothing matches well enough (the parts are put one under the other).
 */
export function findOverlap(prev: Float32Array, next: Float32Array): number {
  const ha = prev.length / BINS;
  const hb = next.length / BINS;
  const min = Math.max(8, Math.round(hb * 0.03));
  const max = Math.round(Math.min(ha, hb) * 0.7);
  let best = 0;
  let bestScore = Infinity;
  for (let o = min; o <= max; o++) {
    const a0 = (ha - o) * BINS;
    let diff = 0;
    let ink = 0;
    let meanA = 0;
    for (let i = 0; i < o * BINS; i++) meanA += prev[a0 + i];
    meanA /= o * BINS;
    for (let i = 0; i < o * BINS; i++) {
      const a = prev[a0 + i];
      const d = a - next[i];
      diff += d * d;
      ink += (a - meanA) * (a - meanA);
    }
    if (ink / (o * BINS) < 4) continue; // blank paper: nothing to match on
    const score = diff / ink;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore < 0.2 ? best : 0;
}

/** Width the parts are brought to (pixels): sharp enough for print, light enough for a phone. */
const WIDTH = 1240;
/** Width the overlap is looked for at (fast). */
const MATCH_W = 240;

function grayOf(img: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  c.width = 0;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
  return g;
}

/** The parts (straightened JPEGs, top first) as one tall page (JPEG). */
export async function composeReceipt(parts: Blob[]): Promise<Blob> {
  const imgs = await Promise.all(parts.map((p) => createImageBitmap(p)));
  try {
    const width = Math.min(WIDTH, ...imgs.map((i) => i.width));
    const heights = imgs.map((i) => Math.round((i.height * width) / i.width));
    // rows to cut off the top of each part (they repeat the one above)
    const cut = [0];
    let feats: Float32Array | null = null;
    for (const [i, img] of imgs.entries()) {
      const mh = Math.max(1, Math.round((img.height * MATCH_W) / img.width));
      const f = rowFeatures(grayOf(img, MATCH_W, mh), MATCH_W, mh);
      if (feats && i > 0) cut.push(Math.round((findOverlap(feats, f) * heights[i]) / mh));
      feats = f;
    }
    const total = heights.reduce((n, h, i) => n + h - (cut[i] ?? 0), 0);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = total;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, total);
    let y = 0;
    for (const [i, img] of imgs.entries()) {
      const skip = cut[i] ?? 0;
      const sy = (skip * img.height) / heights[i];
      ctx.drawImage(img, 0, sy, img.width, img.height - sy, 0, y, width, heights[i] - skip);
      y += heights[i] - skip;
    }
    const out = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((x) => (x ? resolve(x) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9),
    );
    c.width = 0;
    return out;
  } finally {
    imgs.forEach((i) => i.close());
  }
}
