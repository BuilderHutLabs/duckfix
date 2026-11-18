export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/** RGBA -> 8-bit luminance (Rec. 601 weights, alpha ignored). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const n = width * height;
  const data = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    data[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114 + 500) / 1000;
  }
  return { data, width, height };
}

/**
 * Otsu's method. Returns a threshold t such that "dark" pixels are those
 * with value < t (consistent with `inkRatio`). A flat image yields t = 1,
 * i.e. nothing counts as ink.
 */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestVar = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best + 1;
}

/** Fraction of pixels strictly darker than `threshold`. */
export function inkRatio(img: GrayImage, threshold: number): number {
  if (img.data.length === 0) return 0;
  let dark = 0;
  for (let i = 0; i < img.data.length; i++) if (img.data[i] < threshold) dark++;
  return dark / img.data.length;
}

/** True when at least 97% of pixels are near-black (<40) or near-white (>215). */
export function isNearBitonal(img: GrayImage): boolean {
  if (img.data.length === 0) return false;
  let extreme = 0;
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i];
    if (v < 40 || v > 215) extreme++;
  }
  return extreme / img.data.length >= 0.97;
}
