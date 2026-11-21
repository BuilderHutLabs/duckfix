import { paintMarks } from '../../src/edit/paint';
import { simplify, arrowHead, HIGHLIGHT, PEN_FRAC } from '../../src/edit/draw';
import { INK } from '../../src/edit/text';
import type { Mark } from '../../src/model/document';

function fakeCtx() {
  const calls: Array<[string, unknown[]]> = [];
  const ctx: Record<string, unknown> = { calls };
  for (const f of ['fillRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillText', 'ellipse', 'strokeRect', 'closePath', 'translate', 'rotate'])
    ctx[f] = (...a: unknown[]) => {
      calls.push([f, a]);
      if (f === 'stroke' || f === 'fill') calls.push([`${f}:alpha`, [ctx.globalAlpha ?? 1]]);
    };
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

describe('simplify a finger stroke', () => {
  it('keeps both ends and drops points that lie on the line', () => {
    const pts = [0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.3, 0.6];
    expect(simplify(pts, 0.002)).toEqual([0, 0, 0.3, 0.3, 0.3, 0.6]);
  });
  it('keeps a real bend', () => {
    expect(simplify([0, 0, 0.5, 0.2, 1, 0], 0.002)).toEqual([0, 0, 0.5, 0.2, 1, 0]);
  });
  it('a single point stays', () => {
    expect(simplify([0.4, 0.4], 0.002)).toEqual([0.4, 0.4]);
  });
});

describe('painting drawings for the saved page', () => {
  it('pen: one path through every point, in ink colour, thin', () => {
    const ctx = fakeCtx();
    paintMarks(ctx, [{ id: 'p', kind: 'pen', color: 'blue', points: [0.1, 0.1, 0.2, 0.3, 0.4, 0.2] }], 1000, 2000);
    expect(ctx.calls.filter(([f]) => f === 'moveTo')).toEqual([['moveTo', [100, 200]]]);
    expect(ctx.calls.filter(([f]) => f === 'lineTo')).toHaveLength(2);
    expect(ctx.strokeStyle).toBe(INK.blue);
    expect(ctx.lineWidth).toBeCloseTo(1000 * PEN_FRAC);
  });

  it('highlighter: wide, see-through, in its own colour', () => {
    const ctx = fakeCtx();
    paintMarks(ctx, [{ id: 'h', kind: 'highlight', color: 'yellow', points: [0.1, 0.5, 0.9, 0.5] }], 1000, 2000);
    expect(ctx.calls).toContainEqual(['stroke:alpha', [0.35]]);
    expect(ctx.strokeStyle).toBe(HIGHLIGHT.yellow);
  });

  it('rectangle and ellipse are outlines; an arrow is a line with a filled head at its end', () => {
    const ctx = fakeCtx();
    const marks: Mark[] = [
      { id: 'r', kind: 'rect', color: 'red', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      { id: 'e', kind: 'ellipse', color: 'red', x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
      { id: 'a', kind: 'arrow', color: 'black', x: 0.8, y: 0.8, w: -0.3, h: -0.2 },
    ];
    paintMarks(ctx, marks, 1000, 2000);
    expect(ctx.calls).toContainEqual(['strokeRect', [100, 200, 200, 200]]);
    expect(ctx.calls.find(([f]) => f === 'ellipse')![1].slice(0, 4)).toEqual([600, 1100, 100, 100]);
    expect(ctx.calls).toContainEqual(['moveTo', [800, 1600]]);
    const end = ctx.calls.find(([f, a]) => f === 'lineTo' && Math.abs((a[0] as number) - 500) < 1e-6)!;
    expect(end[1][1]).toBeCloseTo(1200);
    expect(ctx.calls.filter(([f]) => f === 'fill')).toHaveLength(1);
  });

  it('arrow head points back along the arrow from its tip', () => {
    // arrow to the right: the head's two back corners are left of the tip, above and below
    const [tip, a, b] = arrowHead(0, 0, 100, 0, 20);
    expect(tip).toEqual([100, 0]);
    expect(a[0]).toBeLessThan(100);
    expect(b[0]).toBeLessThan(100);
    expect(Math.sign(a[1])).toBe(-Math.sign(b[1]));
  });
});
