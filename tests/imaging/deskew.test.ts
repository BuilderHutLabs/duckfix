// @vitest-environment node
import { estimateSkew } from '../../src/imaging/deskew';
import { blankPage, syntheticTextPage } from '../helpers/synthetic';

describe('estimateSkew', () => {
  for (const deg of [-7, -2.5, -0.5, 0, 1.2, 4, 9]) {
    it(`recovers correction for skew ${deg}`, () => {
      const { angleDeg } = estimateSkew(syntheticTextPage(800, 1100, deg));
      expect(Math.abs(angleDeg + deg)).toBeLessThan(0.2);
    });
  }

  it('handles pages wider than 800 px', () => {
    const { angleDeg } = estimateSkew(syntheticTextPage(1600, 2200, 3));
    expect(Math.abs(angleDeg + 3)).toBeLessThan(0.3);
  });

  it('returns 0 for a blank page', () => {
    expect(estimateSkew(blankPage(200, 200)).angleDeg).toBe(0);
  });

  it('runs 800x1100 in under 150 ms', () => {
    const page = syntheticTextPage(800, 1100, 4);
    estimateSkew(page); // warm-up (JIT)
    const t0 = performance.now();
    estimateSkew(page);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
