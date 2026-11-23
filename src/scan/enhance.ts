/** Look of a scanned page: the photo as is, whitened paper, or pure black and white. */
export type ScanFilter = 'color' | 'whiten' | 'bw';
/**
 * How a scan is straightened: a look, 'soft' (the colours kept, a shadow lifted), or 'auto' — the
 * page decides (chooseLook); 'auto-card' is a card, always in colour.
 */
export type ScanLook = ScanFilter | 'soft' | 'auto' | 'auto-card';

/**
 * Evens out the lighting of a page photo in place (RGBA). The paper brightness is estimated per
 * block (the brightest pixels of each block are paper), smoothed, and every pixel is divided by it,
 * so shadows and a grey cast disappear while the ink keeps its contrast.
 */
export function enhance(d: Uint8ClampedArray, w: number, h: number, look: ScanLook): void {
  const mode = look === 'auto' ? chooseLook(d, w, h) : look === 'auto-card' ? 'color' : look;
  if (mode === 'color' || w === 0 || h === 0) return;
  const bg = paperLevel(d, w, h);
  if (mode === 'soft') {
    // the colours as they are, a shadow lifted most of the way (a photo is not flattened to white)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const k = 1 + (255 / Math.max(48, bg(x, y)) - 1) * SOFT;
        for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * k);
      }
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const k = 255 / Math.max(24, bg(x, y));
      if (mode === 'bw') {
        const v = ((d[i] + d[i + 1] + d[i + 2]) / 3) * k;
        const out = v < 175 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = out;
      } else {
        for (let c = 0; c < 3; c++) d[i + c] = levels(d[i + c] * k);
      }
    }
  }
}

/** How much of a shadow 'soft' lifts. */
const SOFT = 0.75;

/**
 * "Auto": an ordinary written page becomes Wybielony; a page with colour or pictures keeps its
 * colour with the shadow lifted ('soft'). The lighting is evened out first, so a hand's shadow on a
 * text page does not look like a picture.
 */
export function chooseLook(d: Uint8ClampedArray, w: number, h: number): 'whiten' | 'soft' {
  if (w === 0 || h === 0) return 'whiten';
  const bg = paperLevel(d, w, h);
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 40000))); // about 40 000 samples
  let n = 0;
  let colour = 0;
  let middle = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const k = 255 / Math.max(24, bg(x, y));
      const r = d[i] * k;
      const g = d[i + 1] * k;
      const b = d[i + 2] * k;
      const hi = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      const l = (r + g + b) / 3;
      n++;
      if (hi - lo > 45 && hi > 60) colour++;
      if (l > 70 && l < 190) middle++;
    }
  }
  return colour / n > 0.08 || middle / n > 0.25 ? 'soft' : 'whiten';
}

/** Near-white goes fully white, the darks get a little deeper (crisper print). */
function levels(v: number): number {
  const lo = 25;
  const hi = 225;
  return Math.max(0, Math.min(255, ((v - lo) * 255) / (hi - lo)));
}

/** Paper brightness at any pixel: per-block maxima, smoothed 3×3, bilinear in between. */
function paperLevel(d: Uint8ClampedArray, w: number, h: number): (x: number, y: number) => number {
  const B = Math.max(8, Math.round(Math.max(w, h) / 40));
  const bw = Math.ceil(w / B);
  const bh = Math.ceil(h / B);
  const raw = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let m = 0;
      for (let y = by * B; y < Math.min(h, (by + 1) * B); y++) {
        for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x++) {
          const i = (y * w + x) * 4;
          const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (v > m) m = v;
        }
      }
      raw[by * bw + bx] = m;
    }
  }
  const smooth = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = by + dy;
          const xx = bx + dx;
          if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) {
            s += raw[yy * bw + xx];
            n++;
          }
        }
      // a block full of ink (big heading) would read dark: never go below its neighbours' average
      smooth[by * bw + bx] = Math.max(raw[by * bw + bx], s / n);
    }
  }
  return (x, y) => {
    const fx = Math.min(bw - 1, Math.max(0, x / B - 0.5));
    const fy = Math.min(bh - 1, Math.max(0, y / B - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(bw - 1, x0 + 1);
    const y1 = Math.min(bh - 1, y0 + 1);
    const ax = fx - x0;
    const ay = fy - y0;
    const top = smooth[y0 * bw + x0] * (1 - ax) + smooth[y0 * bw + x1] * ax;
    const bot = smooth[y1 * bw + x0] * (1 - ax) + smooth[y1 * bw + x1] * ax;
    return top * (1 - ay) + bot * ay;
  };
}
