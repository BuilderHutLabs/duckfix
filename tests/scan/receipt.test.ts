import { findOverlap, rowFeatures } from '../../src/scan/receipt';

/** A long receipt (grey pixels): lines of "text" of random length and position, like a till slip. */
function receipt(w: number, h: number, seed = 7) {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const g = new Uint8ClampedArray(w * h).fill(245);
  for (let y = 10; y < h - 14; y += 14 + Math.floor(rnd() * 6)) {
    const start = Math.floor(rnd() * w * 0.3);
    const end = start + Math.floor(w * (0.3 + rnd() * 0.6));
    for (let yy = y; yy < y + 7; yy++) for (let xx = start; xx < Math.min(w - 4, end); xx++) if (rnd() > 0.35) g[yy * w + xx] = 40;
  }
  return g;
}

const part = (g: Uint8ClampedArray, w: number, from: number, to: number) => g.slice(from * w, to * w);

describe('Paragon: where two photos of a long receipt overlap', () => {
  const w = 200;
  const all = receipt(w, 900);

  it('finds the overlap of two parts (the rows both photos show)', () => {
    const a = part(all, w, 0, 500);
    const b = part(all, w, 420, 900); // 80 rows shown twice
    const o = findOverlap(rowFeatures(a, w, 500), rowFeatures(b, w, 480));
    expect(Math.abs(o - 80)).toBeLessThanOrEqual(2);
  });

  it('a big overlap is found too', () => {
    const a = part(all, w, 0, 400);
    const b = part(all, w, 200, 600); // half of the second photo repeats
    expect(Math.abs(findOverlap(rowFeatures(a, w, 400), rowFeatures(b, w, 400)) - 200)).toBeLessThanOrEqual(2);
  });

  it('two parts that share nothing: no overlap (they are put one under the other)', () => {
    const a = part(all, w, 0, 400);
    const b = part(receipt(w, 400, 99), w, 0, 400);
    expect(findOverlap(rowFeatures(a, w, 400), rowFeatures(b, w, 400))).toBe(0);
  });

  it('blank paper on both sides: nothing to match, no overlap', () => {
    const blank = new Uint8ClampedArray(w * 300).fill(245);
    expect(findOverlap(rowFeatures(blank, w, 300), rowFeatures(blank, w, 300))).toBe(0);
  });

  it('real photos differ a little (shifted a few pixels sideways, noisy): the overlap is still found', () => {
    const a = part(all, w, 0, 500);
    const raw = part(all, w, 430, 900);
    const b = new Uint8ClampedArray(raw.length);
    let x = 3;
    for (let i = 0; i < raw.length; i++) {
      const col = i % w;
      const src = raw[i - (col >= 4 ? 4 : 0)]; // 4 px to the right
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      b[i] = Math.max(0, Math.min(255, src + ((x % 31) - 15))); // grain
    }
    expect(Math.abs(findOverlap(rowFeatures(a, w, 500), rowFeatures(b, w, 470)) - 70)).toBeLessThanOrEqual(3);
  });
});
