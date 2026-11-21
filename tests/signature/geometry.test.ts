import { cropRgba, dragCrop, inkBox, snapAngle, stampPdfPlacement } from '../../src/signature/geometry';
import { moveStamp, addStamp } from '../../src/model/document';
import { docWithFlags } from '../ui/fixtures';

/** w×h RGBA, transparent, with opaque ink pixels at the given points. */
function ink(w: number, h: number, pts: Array<[number, number]>): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of pts) d[(y * w + x) * 4 + 3] = 255;
  return d;
}

describe('signature crop', () => {
  it('cropRgba copies exactly the chosen rectangle', () => {
    const d = ink(10, 10, [[3, 4], [8, 8]]);
    const c = cropRgba(d, 10, 10, { x: 2, y: 3, w: 4, h: 3 });
    expect(c.width).toBe(4);
    expect(c.height).toBe(3);
    expect(c.data[(1 * 4 + 1) * 4 + 3]).toBe(255); // (3,4) → (1,1)
    expect([...c.data].filter((v, i) => i % 4 === 3 && v > 0)).toHaveLength(1); // (8,8) is outside
  });

  it('cropRgba keeps the rectangle inside the image', () => {
    const c = cropRgba(ink(10, 10, []), 10, 10, { x: -5, y: 8, w: 30, h: 9 });
    expect(c).toMatchObject({ width: 10, height: 2 });
  });

  it('inkBox proposes the ink with a margin as the starting frame, clamped to the photo', () => {
    expect(inkBox(ink(100, 50, [[40, 20], [60, 30]]), 100, 50, 0.1)).toEqual({ x: 30, y: 10, w: 41, h: 31 });
    expect(inkBox(ink(100, 50, [[1, 1]]), 100, 50, 0.1)).toMatchObject({ x: 0, y: 0 });
    expect(inkBox(ink(10, 10, []), 10, 10, 0.1)).toBeNull();
  });
});

describe('crop frame dragging', () => {
  const r = { x: 10, y: 10, w: 50, h: 40 };
  it('a corner moves only its own edges', () => {
    expect(dragCrop(r, 'nw', 5, -5, 100, 100)).toEqual({ x: 15, y: 5, w: 45, h: 45 });
    expect(dragCrop(r, 'se', 10, 10, 100, 100)).toEqual({ x: 10, y: 10, w: 60, h: 50 });
  });
  it('the middle moves the whole frame, kept inside the photo', () => {
    expect(dragCrop(r, 'move', 100, -100, 100, 100)).toEqual({ x: 50, y: 0, w: 50, h: 40 });
  });
  it('the frame never shrinks below the minimum or leaves the photo', () => {
    expect(dragCrop(r, 'se', -100, -100, 100, 100, 20)).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(dragCrop(r, 'nw', -50, -50, 100, 100)).toEqual({ x: 0, y: 0, w: 60, h: 50 });
  });
});

describe('signature rotation', () => {
  it('snapAngle keeps the angle in (-180, 180] and snaps near straight angles', () => {
    expect(snapAngle(4)).toBe(0);
    expect(snapAngle(-5)).toBe(0);
    expect(snapAngle(87)).toBe(90);
    expect(snapAngle(30)).toBe(30);
    expect(snapAngle(370)).toBe(10);
    expect(snapAngle(362)).toBe(0);
    expect(snapAngle(200)).toBe(-160);
    expect(snapAngle(-178)).toBe(180);
  });

  it('PDF placement without rotation is the plain box (PDF origin bottom-left)', () => {
    const p = stampPdfPlacement({ x: 0.5, y: 0.75, w: 0.4, h: 0.1 }, 200, 100);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(15);
    expect(p).toMatchObject({ width: 80, height: 10, rotate: 0 });
  });

  it('a rotated signature turns around its own centre (centre stays where it was on screen)', () => {
    const s = { x: 0.25, y: 0.25, w: 0.5, h: 0.1, rot: 90 };
    const p = stampPdfPlacement(s, 100, 100);
    expect(p.rotate).toBe(-90); // clockwise on screen = negative in PDF
    // centre of the box: (50, 70) in PDF coords; corner + R(-90°)·(w/2, h/2) must land there
    const t = (p.rotate * Math.PI) / 180;
    const cx = p.x + (p.width / 2) * Math.cos(t) - (p.height / 2) * Math.sin(t);
    const cy = p.y + (p.width / 2) * Math.sin(t) + (p.height / 2) * Math.cos(t);
    expect(cx).toBeCloseTo(50);
    expect(cy).toBeCloseTo(70);
  });

  it('moving or resizing keeps the rotation; rotating is one undoable change', () => {
    let doc = addStamp(docWithFlags(1), 'p1', { id: 's1', src: 'x', x: 0.1, y: 0.1, w: 0.3, h: 0.1 });
    doc = moveStamp(doc, 'p1', 's1', { rot: 45 });
    expect(doc.pages[0].stamps![0].rot).toBe(45);
    doc = moveStamp(doc, 'p1', 's1', { x: 0.2, y: 0.2, w: 0.3, h: 0.1 });
    expect(doc.pages[0].stamps![0]).toMatchObject({ x: 0.2, rot: 45 });
  });
});
