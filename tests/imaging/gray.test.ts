// @vitest-environment node
import { inkRatio, isNearBitonal, otsuThreshold, toGray } from '../../src/imaging/gray';
import { blankPage, syntheticTextPage } from '../helpers/synthetic';

describe('gray', () => {
  it('converts RGBA to luminance', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    const g = toGray(rgba, 3, 1);
    expect(Array.from(g.data)).toEqual([255, 0, 76]);
  });

  it('blank page has no ink', () => {
    const p = blankPage(200, 300);
    expect(inkRatio(p, otsuThreshold(p))).toBeLessThan(0.005);
  });

  it('text page has ink and Otsu separates black from white', () => {
    const p = syntheticTextPage(400, 500, 0);
    const t = otsuThreshold(p);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(255);
    const r = inkRatio(p, t);
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.6);
  });

  it('detects near-bitonal images', () => {
    expect(isNearBitonal(syntheticTextPage(400, 500, 0))).toBe(true);
    const mid = { data: new Uint8Array(100).fill(128), width: 10, height: 10 };
    expect(isNearBitonal(mid)).toBe(false);
  });
});

describe('innerInkRatio (blank page detection)', () => {
  const W = 400;
  const H = 400;
  const white = () => ({ data: new Uint8Array(W * H).fill(255), width: W, height: H });
  const paint = (img: { data: Uint8Array }, x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data[y * W + x] = 0;
  };

  it('ignores a dark scanner border in the margins', async () => {
    const { innerInkRatio } = await import('../../src/imaging/gray');
    const img = white();
    paint(img, 0, 0, W, 20);
    paint(img, 0, H - 20, W, 20);
    paint(img, 0, 0, 20, H);
    paint(img, W - 20, 0, 20, H);
    expect(innerInkRatio(img, 128)).toBeLessThan(0.0001);
  });

  it('a lone page number stays below the blank limit; a text page is far above it', async () => {
    const { innerInkRatio } = await import('../../src/imaging/gray');
    const { BLANK_INK } = await import('../../src/orientation/policy');
    const numbered = white();
    paint(numbered, 195, 360, 10, 6);
    expect(innerInkRatio(numbered, 128)).toBeLessThan(BLANK_INK);

    const text = white();
    for (let row = 0; row < 30; row++) paint(text, 40, 40 + row * 11, 320, 4);
    expect(innerInkRatio(text, 128)).toBeGreaterThan(0.01);
  });
});
