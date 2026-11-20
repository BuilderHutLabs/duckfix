import { enhance } from '../../src/scan/enhance';

/** RGBA page lit from the left: paper goes from grey 120 (shadow) to 240; text rows are 45 % darker */
function shadowedPage(w = 300, h = 200) {
  const d = new Uint8ClampedArray(w * h * 4);
  const text = (x: number, y: number) => y % 20 < 4 && x % 30 < 22 && y > 20 && y < h - 20 && x > 15 && x < w - 15;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const paper = 120 + (120 * x) / (w - 1);
      const v = text(x, y) ? paper * 0.55 : paper;
      const i = (y * w + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v * 0.95; // a little warm, like real paper
      d[i + 3] = 255;
    }
  return { d, w, h, text };
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] + d[i + 1] + d[i + 2]) / 3;

describe('lighting correction', () => {
  it('Wybielony: the paper becomes evenly white, shadow included; text stays dark', () => {
    const { d, w, h, text } = shadowedPage();
    enhance(d, w, h, 'whiten');
    let minPaper = 255;
    let maxText = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = lum(d, (y * w + x) * 4);
        if (text(x, y)) maxText = Math.max(maxText, v);
        else if (y % 20 > 6 && y % 20 < 18) minPaper = Math.min(minPaper, v); // away from text edges
      }
    expect(minPaper).toBeGreaterThanOrEqual(240);
    expect(maxText).toBeLessThan(150);
  });

  it('Czarno-biały: only black and white, text black, shadowed paper white', () => {
    const { d, w, h, text } = shadowedPage();
    enhance(d, w, h, 'bw');
    const values = new Set<number>();
    for (let i = 0; i < d.length; i += 4) values.add(d[i]);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(d[(22 * w + 20) * 4]).toBe(0); // inside a text row
    expect(d[(22 * w + 2) * 4]).toBe(255); // left margin, in the shadow
    expect(text(20, 22)).toBe(true);
  });

  it('Kolor: the photo is left as it is', () => {
    const { d, w, h } = shadowedPage();
    const before = d.slice();
    enhance(d, w, h, 'color');
    expect(d).toEqual(before);
  });
});
