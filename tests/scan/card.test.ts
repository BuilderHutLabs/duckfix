import { CARD_RATIO, cardLayout, A4 } from '../../src/scan/card';

describe('ID card on an A4 page', () => {
  it('both sides at their real size (85.6 × 54 mm), centred, the front above the back', () => {
    const [front, back] = cardLayout(2);
    const mm = A4.w / 210;
    expect(front.w).toBeCloseTo(85.6 * mm, 0);
    expect(front.h).toBeCloseTo(54 * mm, 0);
    expect(front.w / front.h).toBeCloseTo(CARD_RATIO, 2);
    expect(front.x + front.w / 2).toBeCloseTo(A4.w / 2, 0);
    expect(back.x).toBe(front.x);
    expect(back.y).toBeGreaterThan(front.y + front.h); // a gap between them
    expect(back.y + back.h).toBeLessThan(A4.h / 2 + front.h * 1.5);
    expect(front.y).toBeGreaterThan(0);
  });

  it('one side alone sits in the upper part of the page', () => {
    const [only] = cardLayout(1);
    expect(only.y).toBeLessThan(A4.h / 3);
    expect(only.x + only.w / 2).toBeCloseTo(A4.w / 2, 0);
  });
});
