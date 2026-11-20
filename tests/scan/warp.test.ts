import { applyHomography, defaultQuad, homography, warpSize } from '../../src/scan/quad';
import type { Quad } from '../../src/scan/quad';
import { MAX_CANVAS_PIXELS } from '../../src/export/rasterize';

const Q: Quad = [
  { x: 60, y: 40 },
  { x: 330, y: 55 },
  { x: 320, y: 260 },
  { x: 70, y: 250 },
];

describe('perspective geometry', () => {
  it('the homography maps each sheet corner onto the matching rectangle corner', () => {
    const rect: Quad = [
      { x: 0, y: 0 },
      { x: 270, y: 0 },
      { x: 270, y: 210 },
      { x: 0, y: 210 },
    ];
    const h = homography(Q, rect);
    Q.forEach((p, i) => {
      const r = applyHomography(h, p);
      expect(r.x).toBeCloseTo(rect[i].x, 6);
      expect(r.y).toBeCloseTo(rect[i].y, 6);
    });
  });

  it('output size follows the sheet edges and is capped for big photos', () => {
    const big: Quad = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const s = warpSize(big);
    expect(Math.max(s.w, s.h)).toBe(2400);
    expect(s.w / s.h).toBeCloseTo(4 / 3, 2);
    expect(s.w * s.h).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(warpSize(Q)).toEqual({ w: 260, h: 208 });
  });

  it('the fallback frame is the photo inset by 8 %', () => {
    expect(defaultQuad(1000, 500)).toEqual([
      { x: 80, y: 40 },
      { x: 920, y: 40 },
      { x: 920, y: 460 },
      { x: 80, y: 460 },
    ]);
  });
});
