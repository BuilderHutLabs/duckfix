import { cropRect, paintMarks } from '../../src/edit/paint';
import { pageText } from '../../src/export/pageText';
import type { Mark, Page } from '../../src/model/document';
import { getPdf } from '../../src/imaging/render';

vi.mock('../../src/imaging/render', () => ({ getPdf: vi.fn(), releaseCanvas: vi.fn(), renderPage: vi.fn() }));

/** Records what is drawn. */
function fakeCtx() {
  const calls: Array<[string, unknown[]]> = [];
  const ctx: Record<string, unknown> = { calls };
  for (const f of ['fillRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillText', 'ellipse', 'strokeRect', 'translate', 'rotate'])
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
