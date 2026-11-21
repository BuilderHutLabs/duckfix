import { pageBoxIn } from '../../src/ui/edit/pageBox';

describe('where the page sits in the preview', () => {
  it('a portrait page in a tall stage is letterboxed top and bottom (contain), centred', () => {
    // stage 400×800, element fills it, page 1000×1000 → 400×400 in the middle
    expect(pageBoxIn(400, 800, 400, 800, 1000, 1000, 0)).toEqual({ left: 0, top: 200, width: 400, height: 400 });
  });

  it('a landscape page is letterboxed and then turned a quarter: the box is the turned page', () => {
    // sideways: the element is 800×400 (swapped), page 2000×1000 fits as 800×400, turned → 400×800
    expect(pageBoxIn(400, 800, 800, 400, 2000, 1000, 90)).toEqual({ left: 0, top: 0, width: 400, height: 800 });
  });

  it('a straightened page: the box is the bounding box of the slightly turned page', () => {
    const b = pageBoxIn(1000, 1000, 1000, 1000, 1000, 1000, 2);
    expect(b.width).toBeGreaterThan(1000);
    expect(b.left).toBeLessThan(0);
    expect(b.left + b.width / 2).toBeCloseTo(500);
  });
});
