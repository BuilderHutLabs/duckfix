import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, decideOrientation } from '../../src/orientation/policy';

describe('decideOrientation', () => {
  it('accepts a confident detection without flags', () => {
    expect(decideOrientation({ rotation: 90, confidence: 8 }, 0.08)).toEqual({
      rotation: 90,
      flags: [],
      needsVerify: false,
    });
  });

  it('flags low confidence and asks for verification, keeping the proposed rotation', () => {
    expect(decideOrientation({ rotation: 180, confidence: 1 }, 0.08)).toEqual({
      rotation: 180,
      flags: ['check-orientation'],
      needsVerify: true,
    });
  });

  it('flags pages with too little ink as low-text and does not rotate them', () => {
    const d = decideOrientation({ rotation: 90, confidence: 9 }, 0.004);
    expect(d.flags).toContain('low-text');
    expect(d.rotation).toBe(0);
    expect(d.needsVerify).toBe(false);
  });

  it('treats thresholds as inclusive lower bounds of "ok"', () => {
    const t = DEFAULT_THRESHOLDS;
    expect(decideOrientation({ rotation: 270, confidence: t.minConfidence }, t.minInk).flags).toEqual([]);
  });

  it('honours custom thresholds', () => {
    const d = decideOrientation({ rotation: 90, confidence: 5 }, 0.5, { minConfidence: 6, minInk: 0.01 });
    expect(d.flags).toEqual(['check-orientation']);
  });
});
