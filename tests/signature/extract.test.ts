import { extractInk, trimToInk } from '../../src/signature/extract';

/** grey-ish paper photo (lit unevenly) with a dark-blue stroke in the middle */
function paperWithStroke(w = 200, h = 120) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const paper = 150 + (90 * x) / w;
      const ink = y >= 55 && y < 63 && x >= 60 && x < 150;
      d[i] = ink ? 20 : paper;
      d[i + 1] = ink ? 30 : paper;
      d[i + 2] = ink ? 90 : paper * 0.95;
      d[i + 3] = 255;
    }
  return { data: d, width: w, height: h };
}

describe('signature from a photo of paper', () => {
  it('the paper becomes transparent, the ink stays opaque and keeps its colour', () => {
    const img = paperWithStroke();
    const out = extractInk(img.data, img.width, img.height);
    const at = (x: number, y: number) => (y * img.width + x) * 4;
    expect(out[at(5, 5) + 3]).toBe(0); // shadowed paper corner
    expect(out[at(190, 110) + 3]).toBe(0); // bright paper
    const i = at(100, 58);
    expect(out[i + 3]).toBeGreaterThan(200);
    expect(out[i + 2]).toBeGreaterThan(out[i]); // still blue ink
  });

  it('trims to the ink with a small margin', () => {
    const img = paperWithStroke();
    const ink = extractInk(img.data, img.width, img.height);
    const t = trimToInk(ink, img.width, img.height);
    expect(t).not.toBeNull();
    expect(t!.width).toBeGreaterThanOrEqual(90);
    expect(t!.width).toBeLessThan(120);
    expect(t!.height).toBeGreaterThanOrEqual(8);
    expect(t!.height).toBeLessThan(40);
  });

  it('nothing written: no signature', () => {
    const blank = new Uint8ClampedArray(50 * 50 * 4);
    expect(trimToInk(blank, 50, 50)).toBeNull();
  });
});
