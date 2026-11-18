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
