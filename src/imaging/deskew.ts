import { otsuThreshold, type GrayImage } from './gray';

const MAX_WIDTH = 800;
const MAX_POINTS = 100_000;
const MAX_ALLOWED_DEG = 20;

/**
 * Minimum `score` (confidence) for a skew estimate to be trusted. Callers must
 * NOT deskew below it. Measured on synthetic pages: text 2.1-2.2, text with a
 * large dark image block 1.4, table rules 9.9, random noise 1.0, uniform
 * dark/blank 0. The threshold sits between the image-block and noise values.
 */
export const MIN_SKEW_SCORE = 1.25;

/**
 * Estimates page skew by projection-profile analysis.
 *
 * Sign convention: `angleDeg` is the clockwise rotation (in degrees, as seen
 * on screen) to apply to the page so its text lines become horizontal. A page
 * whose text is tilted counter-clockwise by d (visually up to the right, as
 * produced by `syntheticTextPage(w, h, d)`) yields `angleDeg ~= -d`.
 *
 * Method: downscale to <= 800 px wide, binarize with Otsu, then for each
 * candidate tilt theta project dark pixels onto the line normal
 * (v = x sin(theta) + y cos(theta)) and rank by the sum of squared bin counts
 * (proportional to variance, as total ink is constant). Coarse search at 1
 * degree over [-maxDeg, maxDeg] (maxDeg clamped to 20), refined at 0.1.
 *
 * `score` is a confidence: best score / median of the coarse scores (>= 1).
 * ~1 means a flat profile (photo, noise, no text): callers must not deskew
 * when `score < MIN_SKEW_SCORE`. Pages without ink return `{ 0, 0 }`.
 */
export function estimateSkew(
  img: GrayImage,
  opts: { maxDeg?: number } = {},
): { angleDeg: number; score: number } {
  const maxDeg = Math.min(MAX_ALLOWED_DEG, Math.max(0, opts.maxDeg ?? 10));
  const { xs, ys, width, height } = darkPoints(img);
  if (xs.length === 0) return { angleDeg: 0, score: 0 };

  const bins = new Float64Array(width + height + 4);
  const score = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    // v spans [-width*|s|, height*c + width*|s|]; offset keeps indexes >= 0.
    const offset = width * Math.abs(s);
    const nBins = Math.ceil(height * c + 2 * offset) + 2;
    bins.fill(0, 0, nBins);
    for (let i = 0; i < xs.length; i++) {
      bins[(xs[i] * s + ys[i] * c + offset + 0.5) | 0]++;
    }
    let sumSq = 0;
    for (let i = 0; i < nBins; i++) sumSq += bins[i] * bins[i];
    return sumSq;
  };

  const coarseScores: number[] = [];
  let bestDeg = 0;
  let bestScore = -Infinity;
  const maxInt = Math.floor(maxDeg);
  for (let d = -maxInt; d <= maxInt; d++) {
    const sc = score(d);
    coarseScores.push(sc);
    if (sc > bestScore) {
      bestScore = sc;
      bestDeg = d;
    }
  }
  const coarse = bestDeg;
  for (let k = -10; k <= 10; k++) {
    const d = coarse + k / 10;
    if (k === 0 || Math.abs(d) > maxDeg) continue;
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      bestDeg = d;
    }
  }
  coarseScores.sort((x, y) => x - y);
  const median = coarseScores[coarseScores.length >> 1];
  const confidence = median > 0 ? bestScore / median : 0;
  return { angleDeg: bestDeg === 0 ? 0 : -bestDeg, score: confidence };
}

/** Downscales to <= MAX_WIDTH (box average) and returns coordinates of Otsu-dark pixels. */
function darkPoints(img: GrayImage): { xs: Int16Array; ys: Int16Array; width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / img.width);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  let small: GrayImage = img;
  if (scale < 1) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const y0 = Math.floor(y / scale);
      const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / scale)));
      for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x / scale);
        const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) / scale)));
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) sum += img.data[yy * img.width + xx];
        }
        data[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
      }
    }
    small = { data, width, height };
  }
  const t = otsuThreshold(small);
  let count = 0;
  for (let i = 0; i < small.data.length; i++) if (small.data[i] < t) count++;
  // Dense pages: keep every `stride`-th dark pixel to bound the cost of the angle search.
  const stride = Math.max(1, Math.ceil(count / MAX_POINTS));
  const xs = new Int16Array(Math.ceil(count / stride));
  const ys = new Int16Array(xs.length);
  let k = 0;
  let seen = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (small.data[y * width + x] < t && seen++ % stride === 0) {
        xs[k] = x;
        ys[k] = y;
        k++;
      }
    }
  }
  return { xs, ys, width, height };
}
