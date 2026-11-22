import { detectQuad } from '../../src/scan/detectQuad';
import type { Quad } from '../../src/scan/quad';
import { toGray, type GrayImage } from '../../src/imaging/gray';

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

/** A colour photo painted pixel by pixel; returns the grey copy and the colour pixels. */
function paint(w: number, h: number, px: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      rgba.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { gray: toGray(rgba, w, h), rgba };
}

function insideQuad(q: Quad, x: number, y: number): boolean {
  return q.every((a, i) => {
    const b = q[(i + 1) % 4];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });
}

/** small repeatable noise */
const noise = (x: number, y: number) => ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 10;

const close = (q: Quad | null, truth: Quad, tol: number) => {
  expect(q).not.toBeNull();
  q!.forEach((p, i) => expect(Math.hypot(p.x - truth[i].x, p.y - truth[i].y)).toBeLessThan(tol));
};

describe('detectQuad on harder photos', () => {
  it('a white card on a light wooden desk (as bright as the card, but orange, with grain)', () => {
    const card: Quad = [
      { x: 95, y: 70 },
      { x: 280, y: 74 },
      { x: 277, y: 190 },
      { x: 93, y: 186 },
    ];
    const { gray, rgba } = paint(320, 300, (x, y) => {
      if (insideQuad(card, x + 0.5, y + 0.5)) {
        const ink = y > 90 && y < 175 && x > 110 && x < 250 && (y >> 3) % 2 === 0 && (x >> 2) % 3 !== 0;
        return ink ? [70, 72, 80] : [214 + noise(x, y), 222 + noise(x, y), 226];
      }
      // wood: orange-brown, light, with long grain lines
      const grain = 18 * Math.sin(y * 0.35 + Math.sin(x * 0.02) * 3);
      return [205 + grain + noise(x, y), 150 + grain, 85 + grain / 2];
    });
    close(detectQuad(gray, rgba), card, 6);
  });

  it('a page on grey jeans with light patches touching it and tables printed inside', () => {
    const page: Quad = [
      { x: 60, y: 95 },
      { x: 295, y: 103 },
      { x: 287, y: 272 },
      { x: 45, y: 258 },
    ];
    const box: Quad = [
      { x: 85, y: 120 },
      { x: 270, y: 126 },
      { x: 265, y: 235 },
      { x: 75, y: 228 },
    ];
    const { gray, rgba } = paint(320, 320, (x, y) => {
      if (insideQuad(page, x + 0.5, y + 0.5)) {
        // a printed table: its frame and rows are straight lines inside the page
        const onFrame =
          insideQuad(box, x + 0.5, y + 0.5) &&
          (!insideQuad(box, x + 2.5, y + 0.5) ||
            !insideQuad(box, x - 1.5, y + 0.5) ||
            !insideQuad(box, x + 0.5, y + 2.5) ||
            !insideQuad(box, x + 0.5, y - 1.5));
        const row = insideQuad(box, x + 0.5, y + 0.5) && Math.round(y - 0.03 * x) % 14 === 0;
        return onFrame || row ? [95, 85, 110] : [200 + noise(x, y), 196 + noise(x, y), 172];
      }
      // jeans: grey-blue weave; two light knee patches near the top touching the page
      const knee = Math.max(0, 1 - Math.hypot(x - 110, y - 70) / 75) + Math.max(0, 1 - Math.hypot(x - 225, y - 65) / 75);
      const v = 85 + 95 * Math.min(1, knee) + 12 * Math.sin(x * 0.9) * Math.sin(y * 0.7) + noise(x, y);
      return [v, v + 2, v + 6];
    });
    close(detectQuad(gray, rgba), page, 7);
  });
});
