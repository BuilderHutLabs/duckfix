import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_PIXELS, budgetedMaxSide, rotatedSize } from '../../src/export/rasterize';

describe('rotatedSize', () => {
  it('is exact for right angles', () => {
    expect(rotatedSize(2480, 3508, 0)).toEqual({ w: 2480, h: 3508 });
    expect(rotatedSize(1700, 2200, 90)).toEqual({ w: 2200, h: 1700 });
    expect(rotatedSize(2480, 3508, 180)).toEqual({ w: 2480, h: 3508 });
    expect(rotatedSize(1700, 2200, 270)).toEqual({ w: 2200, h: 1700 });
    expect(rotatedSize(1700, 2200, 360 + 90)).toEqual({ w: 2200, h: 1700 });
  });
  it('grows for skew', () => {
    const s = rotatedSize(1000, 1000, 45);
    expect(s.w).toBe(1415);
    expect(s.h).toBe(1415);
    const t = rotatedSize(2480, 3508, 2);
    expect(t.w).toBeGreaterThan(2480);
    expect(t.h).toBeGreaterThan(3508);
  });
});

describe('budgetedMaxSide', () => {
  const area = (w: number, h: number, deg: number, side: number) => {
    const k = side / Math.max(w, h);
    const s = rotatedSize(Math.round(w * k), Math.round(h * k), deg);
    return s.w * s.h;
  };
  it('keeps full 300 DPI for A4', () => {
    expect(budgetedMaxSide(595.28, 841.89, 2, (841.89 * 300) / 72)).toBeCloseTo((841.89 * 300) / 72);
  });
  it('shrinks skewed A3 to the pixel budget', () => {
    const side = (1190.55 * 300) / 72;
    const m = budgetedMaxSide(841.89, 1190.55, 2, side);
    expect(m).toBeLessThan(side);
    expect(area(841.89, 1190.55, 2, m)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });
});
