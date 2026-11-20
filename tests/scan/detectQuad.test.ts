import { detectQuad } from '../../src/scan/detectQuad';
import type { Quad } from '../../src/scan/quad';
import type { GrayImage } from '../../src/imaging/gray';

/** dark-grey "table" with a white convex quadrilateral "sheet" */
function sheetOnTable(w: number, h: number, q: Quad, paper = 235, table = 70): GrayImage {
  const data = new Uint8Array(w * h).fill(table);
  const inside = (x: number, y: number) =>
    q.every((a, i) => {
      const b = q[(i + 1) % 4];
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0; // clockwise on screen (y down)
    });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) data[y * w + x] = paper;
  return { data, width: w, height: h };
}

const TRUTH: Quad = [
  { x: 60, y: 40 },
  { x: 330, y: 55 },
  { x: 320, y: 260 },
  { x: 70, y: 250 },
];

describe('detectQuad', () => {
  it('finds the sheet corners in TL, TR, BR, BL order within 6 px', () => {
    const q = detectQuad(sheetOnTable(400, 300, TRUTH));
    expect(q).not.toBeNull();
    q!.forEach((p, i) => {
      expect(Math.hypot(p.x - TRUTH[i].x, p.y - TRUTH[i].y)).toBeLessThan(6);
    });
  });

  it('a strongly tilted sheet still comes back in reading order', () => {
    const tilted: Quad = [
      { x: 150, y: 20 },
      { x: 370, y: 120 },
      { x: 250, y: 285 },
      { x: 30, y: 180 },
    ];
    const q = detectQuad(sheetOnTable(400, 300, tilted));
    expect(q).not.toBeNull();
    q!.forEach((p, i) => expect(Math.hypot(p.x - tilted[i].x, p.y - tilted[i].y)).toBeLessThan(6));
  });

  it('gives up on a uniform picture (no sheet to find)', () => {
    expect(detectQuad({ data: new Uint8Array(400 * 300).fill(128), width: 400, height: 300 })).toBeNull();
  });

  it('gives up when the bright area is too small to be the sheet', () => {
    const tiny: Quad = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ];
    expect(detectQuad(sheetOnTable(400, 300, tiny))).toBeNull();
  });
});
