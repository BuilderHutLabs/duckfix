import { cropRect, paintMarks } from '../../src/edit/paint';
import { fontFrac, newTextBox, tickBox, INK } from '../../src/edit/text';
import { pageText } from '../../src/export/pageText';
import type { Mark, Page } from '../../src/model/document';
import { getPdf } from '../../src/imaging/render';

vi.mock('../../src/imaging/render', () => ({ getPdf: vi.fn(), releaseCanvas: vi.fn(), renderPage: vi.fn() }));

/** Records what is drawn. */
function fakeCtx() {
  const calls: Array<[string, unknown[]]> = [];
  const ctx: Record<string, unknown> = { calls };
  for (const f of ['fillRect', 'setLineDash', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillText', 'ellipse', 'strokeRect', 'translate', 'rotate'])
    ctx[f] = (...a: unknown[]) => {
      calls.push([f === 'fillRect' ? `fillRect:${String(ctx.fillStyle)}` : f, a]);
    };
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

describe('painting marks for the saved page', () => {
  it('covers are filled rectangles in their colour, at the pixel box', () => {
    const ctx = fakeCtx();
    const marks: Mark[] = [
      { id: 'a', kind: 'cover', color: 'black', x: 0.1, y: 0.5, w: 0.5, h: 0.1 },
      { id: 'b', kind: 'cover', color: 'white', x: 0, y: 0, w: 1, h: 0.25 },
    ];
    paintMarks(ctx, marks, 1000, 2000);
    expect(ctx.calls).toContainEqual(['fillRect:#000000', [100, 1000, 500, 200]]);
    expect(ctx.calls).toContainEqual(['fillRect:#ffffff', [0, 0, 1000, 500]]);
  });

  it('text is written line by line in its colour; the font follows the box height', () => {
    const ctx = fakeCtx();
    // two lines, box 10 % of the page high → font = 0.1 / (2 × 1.25) = 4 % of 2000 px = 80 px
    paintMarks(ctx, [{ id: 't', kind: 'text', text: 'Zażółć gęślą\njaźń', color: 'blue', size: 2, x: 0.1, y: 0.2, w: 0.5, h: 0.1 }], 1000, 2000);
    expect(ctx.font).toBe('80px sans-serif');
    expect(ctx.fillStyle).toBe(INK.blue);
    const texts = ctx.calls.filter(([f]) => f === 'fillText').map(([, a]) => a);
    expect(texts[0][0]).toBe('Zażółć gęślą');
    expect(texts[1][0]).toBe('jaźń');
    expect(texts[0][1]).toBe(100);
    expect((texts[1][2] as number) - (texts[0][2] as number)).toBe(100); // line height 1.25 × 80
  });

  it('tick and cross are strokes inside their box', () => {
    const ctx = fakeCtx();
    paintMarks(ctx, [
      { id: 'a', kind: 'check', color: 'black', x: 0.5, y: 0.5, w: 0.1, h: 0.05 },
      { id: 'b', kind: 'cross', color: 'red', x: 0, y: 0, w: 0.1, h: 0.05 },
    ], 1000, 2000);
    expect(ctx.calls.filter(([f]) => f === 'stroke')).toHaveLength(3); // one per line
    expect(ctx.calls.filter(([f]) => f === 'moveTo')).toHaveLength(3); // tick: 1 path, cross: 2 lines
    expect(ctx.lineWidth).toBeCloseTo(100 * 0.12);
  });

  it('box helpers: new text fits its lines, font size from the box, tick is square on screen', () => {
    const b = newTextBox('Jan\nKowalski', 2, { x: 0.2, y: 0.3 }, 600, 800);
    expect(b.h).toBeCloseTo(2 * 1.25 * 0.024);
    expect(fontFrac({ text: 'Jan\nKowalski', h: b.h })).toBeCloseTo(0.024);
    expect(b.w).toBeGreaterThan(0.05);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    const t = tickBox(2, { x: 0.5, y: 0.5 }, 600, 800);
    expect(t.w * 600).toBeCloseTo(t.h * 800); // square in pixels
    expect(t.x + t.w / 2).toBeCloseTo(0.5); // centred on the tap
  });

  it('cropRect is in whole pixels, inside the canvas and never empty', () => {
    expect(cropRect(undefined, 1000, 800)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
    expect(cropRect({ x: 0.1, y: 0.25, w: 0.5, h: 0.5 }, 1000, 800)).toEqual({ x: 100, y: 200, w: 500, h: 400 });
    expect(cropRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.0001 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 1 });
  });
});

describe('copy text of an edited page', () => {
  const pdfPage = (extra: Partial<Page> = {}): Page => ({
    id: 'p1',
    source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 0, hasTextLayer: true },
    rotation: 0,
    skewDeg: 0,
    flags: [],
    autoRotation: null,
    analyzed: true,
    ...extra,
  });
  const src = { id: 'f1', name: 'a.pdf', type: 'pdf' as const, blob: new Blob([]) };
  const raster = vi.fn(async () => ({ bytes: new Uint8Array([1]), format: 'png' as const, widthPt: 1, heightPt: 1 }));
  const ocr = async () => ({ text: vi.fn(async () => 'widoczny tekst'), textLayer: vi.fn(), dispose: vi.fn() });

  it('a page with a cover is read from the saved image, never from the PDF text (hidden data stays hidden)', async () => {
    const page = pdfPage({ marks: [{ id: 'a', kind: 'cover', color: 'black', x: 0, y: 0, w: 1, h: 0.1 }] });
    expect(await pageText(page, src, raster, ocr)).toBe('widoczny tekst');
    expect(getPdf).not.toHaveBeenCalled();
  });

  it('a cropped page too', async () => {
    expect(await pageText(pdfPage({ crop: { x: 0, y: 0.5, w: 1, h: 0.5 } }), src, raster, ocr)).toBe('widoczny tekst');
    expect(getPdf).not.toHaveBeenCalled();
  });
});
