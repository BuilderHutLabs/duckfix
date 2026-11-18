// @vitest-environment node
import { estimateSkew, MIN_SKEW_SCORE } from '../../src/imaging/deskew';
import { blankPage, darkPage, noisePage, syntheticTextPage, tableRulesPage, textPageWithImageBlock } from '../helpers/synthetic';

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

  it('is confident on text pages', () => {
    expect(estimateSkew(syntheticTextPage(800, 1100, 4)).score).toBeGreaterThanOrEqual(MIN_SKEW_SCORE);
  });

  it('finds the angle of text next to a dark image block', () => {
    for (const deg of [3, -6]) {
      const { angleDeg, score } = estimateSkew(textPageWithImageBlock(800, 1100, deg));
      expect(Math.abs(angleDeg + deg)).toBeLessThan(0.3);
      expect(score).toBeGreaterThanOrEqual(MIN_SKEW_SCORE);
    }
  });

  it('finds the angle of a table-rules page', () => {
    const { angleDeg, score } = estimateSkew(tableRulesPage(800, 1100, 2));
    expect(Math.abs(angleDeg + 2)).toBeLessThan(0.3);
    expect(score).toBeGreaterThanOrEqual(MIN_SKEW_SCORE);
  });

  it('has low confidence on noise and uniform dark pages', () => {
    expect(estimateSkew(noisePage(800, 1100, 1)).score).toBeLessThan(MIN_SKEW_SCORE);
    expect(estimateSkew(noisePage(800, 1100, 99)).score).toBeLessThan(MIN_SKEW_SCORE);
    expect(estimateSkew(darkPage(800, 1100)).score).toBeLessThan(MIN_SKEW_SCORE);
  });

  it('clamps maxDeg to 20 without overflowing', () => {
    const { angleDeg } = estimateSkew(syntheticTextPage(800, 1100, 4), { maxDeg: 90 });
    expect(Math.abs(angleDeg)).toBeLessThanOrEqual(20);
    expect(Math.abs(angleDeg + 4)).toBeLessThan(0.2);
  });

  it('runs 800x1100 in under 150 ms', () => {
    const page = syntheticTextPage(800, 1100, 4);
    estimateSkew(page); // warm-up (JIT)
    const t0 = performance.now();
    estimateSkew(page);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
