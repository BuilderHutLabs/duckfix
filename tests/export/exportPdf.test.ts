// @vitest-environment node
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { exportFileName, exportPdf, type Rasterizer } from '../../src/export/exportPdf';
import type { Doc, Page, Rotation } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';

// 1x1 transparent-ish PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
);

async function makePdf(sizes: Array<[number, number]>, baseRotation: Rotation = 0): Promise<SourceFile> {
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
  return pdf.context.enumerateIndirectObjects().filter(([, o]) => {
    const dict = (o as { dict?: PDFDict }).dict;
    return dict?.get(PDFName.of('Subtype')) === PDFName.of('Image');
  }).length;
}

/** stand-in for tesseract's text-only page */
async function textOnlyPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([50, 50]).drawText('x', { size: 8, opacity: 0 });
  return pdf.save();
}

async function load(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

describe('exportPdf', () => {
  it('keeps order and deletions', async () => {
    const src = await makePdf([
      [100, 100],
      [200, 200],
      [300, 300],
    ]);
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
    const out = await load(await exportPdf({ pages: [pdfPage(0)] }, new Map([['f1', src]]), fakeRaster()));
    expect(out.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
    expect(out.getPage(0).getRotation().angle).toBe(0);
  });

  it('reports progress after every page', async () => {
    const src = await makePdf([
      [100, 100],
      [200, 200],
      [300, 300],
    ]);
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
    const src = await makePdf([
      [100, 100],
      [100, 100],
    ]);
    const r = fakeRaster();
    const doc: Doc = { pages: [pdfPage(0), pdfPage(1, { skewDeg: 2 })] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), r));
    expect(r).toHaveBeenCalledTimes(1);
    expect(r.mock.calls[0][0].id).toBe('p1');
    expect(out.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(out.getPage(1).getRotation().angle).toBe(0);
    expect(imageCount(out)).toBeGreaterThan(0); // PNG alpha adds an SMask image too
  });

  it('a smaller size level: every page is rasterized, untouched PDF pages too, at that level', async () => {
    const src = await makePdf([
      [100, 100],
      [100, 100],
    ]);
    const r = fakeRaster();
    const doc: Doc = { pages: [pdfPage(0), pdfPage(1, { skewDeg: 2 })] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), r, undefined, { compress: 2 }));
    expect(r).toHaveBeenCalledTimes(2);
    expect(r.mock.calls.map((c) => c[2])).toEqual([{ compress: 2 }, { compress: 2 }]);
    expect(out.getPageCount()).toBe(2);
  });

  it('without options an untouched PDF page is copied, not rasterized', async () => {
    const src = await makePdf([[100, 100]]);
    const r = fakeRaster();
    await exportPdf({ pages: [pdfPage(0)] }, new Map([['f1', src]]), r);
    expect(r).not.toHaveBeenCalled();
  });

  it('cancelling stops the export with an AbortError', async () => {
    const src = await makePdf([
      [100, 100],
      [100, 100],
      [100, 100],
    ]);
    const ctrl = new AbortController();
    const run = exportPdf(
      { pages: [pdfPage(0), pdfPage(1), pdfPage(2)] },
      new Map([['f1', src]]),
      fakeRaster(),
      (done) => done === 1 && ctrl.abort(),
      { signal: ctrl.signal },
    );
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('searchable text: OCR runs on image pages, not on PDF pages that already have text', async () => {
    const src = await makePdf([[100, 100]]);
    const img: SourceFile = { id: 'i1', name: 'foto.jpg', type: 'image', blob: new Blob([PNG as BlobPart]) };
    const layer = await textOnlyPdf();
    const ocr = { textLayer: vi.fn(async () => layer), text: vi.fn(async () => ''), dispose: vi.fn(async () => {}) };
    const imagePage: Page = { ...pdfPage(0), id: 'img', source: { kind: 'image', fileId: 'i1' } };
    const doc: Doc = { pages: [pdfPage(0), imagePage] };
    const out = await load(
      await exportPdf(
        doc,
        new Map([
          ['f1', src],
          ['i1', img],
        ]),
        fakeRaster(),
        undefined,
        { ocr },
      ),
    );
    expect(ocr.textLayer).toHaveBeenCalledTimes(1);
    expect(out.getPageCount()).toBe(2);
  });

  it('searchable text: an untouched PDF page without text gets rasterized and recognized', async () => {
    const src = await makePdf([[100, 100]]);
    const r = fakeRaster();
    const ocr = { textLayer: vi.fn(async () => textOnlyPdf()), text: vi.fn(async () => ''), dispose: vi.fn(async () => {}) };
    const scan = pdfPage(0, { source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 0, hasTextLayer: false } });
    await exportPdf({ pages: [scan] }, new Map([['f1', src]]), r, undefined, { ocr });
    expect(r).toHaveBeenCalledTimes(1);
    expect(ocr.textLayer).toHaveBeenCalledTimes(1);
  });

  it('a page with a look (Wybielony) is rasterized, untouched PDF page or not', async () => {
    const src = await makePdf([
      [100, 100],
      [100, 100],
    ]);
    const r = fakeRaster();
    const doc: Doc = { pages: [pdfPage(0, { filter: 'whiten' }), pdfPage(1)] };
    await exportPdf(doc, new Map([['f1', src]]), r);
    expect(r).toHaveBeenCalledTimes(1);
    expect(r.mock.calls[0][0].filter).toBe('whiten');
  });

  it('a signed page is saved as one image with the signature in it (the rasterizer draws it)', async () => {
    const src = await makePdf([[100, 100]]);
    const r = fakeRaster();
    const sig = { id: 's1', src: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`, x: 0.5, y: 0.75, w: 0.4, h: 0.1 };
    const doc: Doc = { pages: [pdfPage(0, { stamps: [sig] })] };
    const out = await load(await exportPdf(doc, new Map([['f1', src]]), r));
    expect(r).toHaveBeenCalledTimes(1);
    expect(r.mock.calls[0][0].stamps).toEqual([sig]);
    const plain = await load(await exportPdf({ pages: [pdfPage(0, { skewDeg: 1 })] }, new Map([['f1', src]]), fakeRaster()));
    expect(imageCount(out)).toBe(imageCount(plain)); // nothing drawn on top of the page image
  });

  it('a page with a cover or a crop is saved as an image (the PDF text under a cover is gone)', async () => {
    const src = await makePdf([
      [100, 100],
      [100, 100],
      [100, 100],
    ]);
    const r = fakeRaster();
    const cover = { id: 'm', kind: 'cover' as const, color: 'black' as const, x: 0, y: 0, w: 1, h: 0.2 };
    const doc: Doc = { pages: [pdfPage(0, { marks: [cover] }), pdfPage(1, { crop: { x: 0, y: 0, w: 0.5, h: 1 } }), pdfPage(2)] };
    await exportPdf(doc, new Map([['f1', src]]), r);
    expect(r).toHaveBeenCalledTimes(2);
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

/** A PDF holding just the test PNG once (to count the objects one embedded picture makes). */
async function pngOnlyPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([10, 10]).drawImage(await pdf.embedPng(PNG), { x: 0, y: 0, width: 1, height: 1 });
  return pdf.save();
}

describe('watermark "Kopia dla…"', () => {
  it('every page gets the watermark picture, see-through, over a copied PDF page and over a picture page; the PDF text stays', async () => {
    const src = await makePdf([
      [595, 842],
      [595, 842],
    ]);
    const doc: Doc = { pages: [pdfPage(0), pdfPage(1, { skewDeg: 3 })] };
    const raster = fakeRaster();
    const bytes = await exportPdf(doc, new Map([['f1', src]]), raster, undefined, {
      watermark: { png: PNG, width: 400, height: 60 },
    });
    const out = await PDFDocument.load(bytes);
    const plain = await PDFDocument.load(await exportPdf(doc, new Map([['f1', src]]), fakeRaster()));
    // the watermark picture is added once and shared by both pages; the first page stays a copied PDF page
    expect(imageCount(out)).toBe(imageCount(plain) + imageCount(await PDFDocument.load(await pngOnlyPdf())));
    expect(raster).toHaveBeenCalledTimes(1);
    for (const p of out.getPages()) expect(p.node.Resources()!.lookup(PDFName.of('XObject'))).toBeTruthy();
    // drawn see-through (a graphics state with fill opacity below 1)
    for (const p of out.getPages()) {
      const states = p.node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict);
      const opacities = states
        .values()
        .map((v) => (out.context.lookup(v, PDFDict).get(PDFName.of('ca')) as unknown as { asNumber(): number }).asNumber());
      expect(opacities.some((o) => o < 1)).toBe(true);
    }
  });

  it('without a watermark nothing is added', async () => {
    const src = await makePdf([[595, 842]]);
    const bytes = await exportPdf({ pages: [pdfPage(0)] }, new Map([['f1', src]]), fakeRaster());
    expect(imageCount(await PDFDocument.load(bytes))).toBe(0);
  });
});
