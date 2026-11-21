import { turnBox, turnPage } from '../../src/edit/turn';
import type { Page } from '../../src/model/document';

const close = (a: object, b: object) => {
  for (const k of Object.keys(b)) expect((a as Record<string, number>)[k]).toBeCloseTo((b as Record<string, number>)[k]);
};

describe('turning a page turns what is on it', () => {
  it('a box turned 90° clockwise: its top-left corner goes to the top-right', () => {
    close(turnBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, 90), { x: 0.7, y: 0.1, w: 0.1, h: 0.3 });
  });

  it('180° and −90°', () => {
    close(turnBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, 180), { x: 0.6, y: 0.7, w: 0.3, h: 0.1 });
    close(turnBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, -90), { x: 0.2, y: 0.6, w: 0.1, h: 0.3 });
  });

  it('four quarter turns bring everything back', () => {
    const b = { x: 0.13, y: 0.27, w: 0.31, h: 0.12 };
    let t = b;
    for (let i = 0; i < 4; i++) t = turnBox(t, 90);
    close(t, b);
  });

  const page = (extra: Partial<Page>): Page => ({
    id: 'p', source: { kind: 'image', fileId: 'f' }, rotation: 0, skewDeg: 0, flags: [], autoRotation: null, analyzed: true, ...extra,
  });

  it('covers, pen points, arrows and the crop follow the page', () => {
    const p = turnPage(
      page({
        crop: { x: 0, y: 0, w: 0.5, h: 1 },
        marks: [
          { id: 'c', kind: 'cover', color: 'black', x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
          { id: 'p', kind: 'pen', color: 'black', points: [0.1, 0.2, 0.3, 0.4] },
          { id: 'a', kind: 'arrow', color: 'red', x: 0.1, y: 0.1, w: 0.2, h: 0 },
        ],
      }),
      90,
      0.7,
    );
    close(p.crop!, { x: 0, y: 0, w: 1, h: 0.5 });
    close(p.marks![0] as never, { x: 0.7, y: 0.1, w: 0.1, h: 0.3 });
    const pts = (p.marks![1] as { points: number[] }).points;
    [0.8, 0.1, 0.6, 0.3].forEach((v, i) => expect(pts[i]).toBeCloseTo(v));
    close(p.marks![2] as never, { x: 0.9, y: 0.1, w: 0, h: 0.2 });
  });

  it('text, ticks and signatures stay upright and keep their real size; their centre follows the page', () => {
    // portrait page, width 0.7 of its height; after a quarter turn it is landscape
    const p = turnPage(
      page({
        marks: [{ id: 't', kind: 'text', text: 'Jan', color: 'black', size: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.03 }],
        stamps: [{ id: 's', src: 'x', x: 0.5, y: 0.8, w: 0.2, h: 0.05, rot: 10 }],
      }),
      90,
      0.7,
    );
    const t = p.marks![0] as { x: number; y: number; w: number; h: number };
    expect(t.w).toBeCloseTo(0.2 * 0.7);
    expect(t.h).toBeCloseTo(0.03 / 0.7);
    expect(t.x + t.w / 2).toBeCloseTo(1 - 0.115);
    expect(t.y + t.h / 2).toBeCloseTo(0.2);
    expect(p.stamps![0]).toMatchObject({ rot: 10 });
    expect(p.stamps![0].w).toBeCloseTo(0.14);
  });
});
