// @vitest-environment node
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { exportFileName, exportPdf, type Rasterizer } from '../../src/export/exportPdf';
import type { Doc, Page, Rotation } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';

// 1x1 transparent-ish PNG
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

async function makePdf(
  sizes: Array<[number, number]>,
  baseRotation: Rotation = 0,
): Promise<SourceFile> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  sizes.forEach(([w, h], i) => {
    const p = pdf.addPage([w, h]);
    p.drawText(`P${i + 1}`, { x: 20, y: 20, font });
    if (baseRotation) p.setRotation(degrees(baseRotation));
  });
  const bytes = await pdf.save();
  return { id: 'f1', name: 'a.pdf', type: 'pdf', blob: new Blob([bytes as BlobPart]) };
}

function pdfPage(i: number, over: Partial<Page> = {}, base: Rotation = 0, fileId = 'f1'): Page {
  return {
    id: `p${i}`,
    source: { kind: 'pdf', fileId, pageIndex: i, baseRotation: base, hasTextLayer: true },
    rotation: 0,
    skewDeg: 0,
    flags: [],
    autoRotation: null,
    analyzed: true,
    ...over,
  };
}

const fakeRaster = (): Rasterizer & ReturnType<typeof vi.fn> =>
  vi.fn(async () => ({ bytes: PNG, format: 'png' as const, widthPt: 300, heightPt: 400 }));

function imageCount(pdf: PDFDocument): number {
  return pdf.context
    .enumerateIndirectObjects()
    .filter(([, o]) => {
      const dict = (o as { dict?: PDFDict }).dict;
      return dict?.get(PDFName.of('Subtype')) === PDFName.of('Image');
    }).length;
}

async function load(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

describe('exportPdf', () => {
  it('keeps order and deletions', async () => {
    const src = await makePdf([[100, 100], [200, 200], [300, 300]]);
    const doc: Doc = { pages: [pdfPage(2), pdfPage(0)] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), fakeRaster()));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getSize()).toEqual({ width: 300, height: 300 });
    expect(out.getPage(1).getSize()).toEqual({ width: 100, height: 100 });
  });

  it('sets absolute effective rotation (base 90 + rotation 90 -> 180)', async () => {
    const src = await makePdf([[100, 200]], 90);
    const doc: Doc = { pages: [pdfPage(0, { rotation: 90 }, 90)] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), fakeRaster()));
    expect(out.getPage(0).getRotation().angle).toBe(180);
  });

  it('keeps a landscape page 842x595', async () => {
    const src = await makePdf([[842, 595]]);
    const out = await load(
      await exportPdf({ pages: [pdfPage(0)] }, new Map([['f1', src]]), fakeRaster()),
    );
    expect(out.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
    expect(out.getPage(0).getRotation().angle).toBe(0);
  });

  it('reports progress after every page', async () => {
    const src = await makePdf([[100, 100], [200, 200], [300, 300]]);
    const doc: Doc = { pages: [pdfPage(0), pdfPage(1, { skewDeg: 1 }), pdfPage(2)] };
    const progress: Array<[number, number]> = [];
    await exportPdf(doc, new Map([['f1', src]]), fakeRaster(), (done, total) => progress.push([done, total]));
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('rasterizes only skewed pages', async () => {
    const src = await makePdf([[100, 100], [100, 100]]);
    const r = fakeRaster();
    const doc: Doc = { pages: [pdfPage(0), pdfPage(1, { skewDeg: 2 })] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), r));
    expect(r).toHaveBeenCalledTimes(1);
    expect(r.mock.calls[0][0].id).toBe('p1');
    expect(out.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(out.getPage(1).getRotation().angle).toBe(0);
    expect(imageCount(out)).toBeGreaterThan(0); // PNG alpha adds an SMask image too
  });

  it('always rasterizes image pages', async () => {
    const img: SourceFile = { id: 'i1', name: 'foto.jpg', type: 'image', blob: new Blob([PNG as BlobPart]) };
    const r = fakeRaster();
    const page: Page = { ...pdfPage(0), source: { kind: 'image', fileId: 'i1' } };
    const out = await load(await exportPdf({ pages: [page] }, new Map([['i1', img]]), r));
    expect(r).toHaveBeenCalledTimes(1);
    expect(out.getPageCount()).toBe(1);
  });
});

describe('exportFileName', () => {
  it('uses the given language suffix and strips a suffix from any language', () => {
    expect(exportFileName('scan.pdf', ' (fixed)')).toBe('scan (fixed).pdf');
    expect(exportFileName('scan (corregido).pdf', ' (fixed)')).toBe('scan (fixed).pdf');
    expect(exportFileName('a (korrigiert) (2).pdf', ' (poprawiony)')).toBe('a (poprawiony).pdf');
  });

  it('appends " (poprawiony)" and uses .pdf', () => {
    expect(exportFileName('Scan_20261119_1345.pdf')).toBe('Scan_20261119_1345 (poprawiony).pdf');
    expect(exportFileName('foto.jpg')).toBe('foto (poprawiony).pdf');
    expect(exportFileName('noext')).toBe('noext (poprawiony).pdf');
  });

  it('does not stack the suffix when a corrected file is opened again', () => {
    expect(exportFileName('skan (poprawiony).pdf')).toBe('skan (poprawiony).pdf');
    expect(exportFileName('skan (poprawiony) (1).pdf')).toBe('skan (poprawiony).pdf');
  });
});
