// @vitest-environment node
import { PDFDocument, PDFHexString, PDFNumber, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { ImportError } from '../../src/import/errors';
import { importFiles } from '../../src/import/importFiles';
import { setPdfjsLoader } from '../../src/imaging/render';

beforeAll(() => {
  setPdfjsLoader(() => import('pdfjs-dist/legacy/build/pdf.mjs'));
});

function pdfFile(bytes: Uint8Array, name = 'a.pdf'): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

async function threePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([200, 300]);
  doc.getPage(1).setRotation(degrees(90));
  return doc.save();
}

// pdf-lib cannot encrypt; we add an /Encrypt dict (Standard handler, bogus
// O/U entries) to the trailer, which is enough for pdf.js to ask for a password.
async function encryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  const ctx = doc.context;
  const hex32 = PDFHexString.of('00'.repeat(32));
  const encrypt = ctx.obj({
    Filter: 'Standard',
    V: 1,
    R: 2,
    O: hex32,
    U: hex32,
    P: PDFNumber.of(-4),
  });
  ctx.trailerInfo.Encrypt = ctx.register(encrypt);
  const id = PDFHexString.of('11'.repeat(16));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
  return doc.save({ useObjectStreams: false });
}

describe('importFiles', () => {
  it('imports pdf pages with baseRotation from /Rotate', async () => {
    const { sources, pages } = await importFiles([pdfFile(await threePagePdf())]);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('pdf');
    expect(pages).toHaveLength(3);
    const rots = pages.map((p) => (p.source.kind === 'pdf' ? p.source.baseRotation : -1));
    expect(rots).toEqual([0, 90, 0]);
    const p = pages[1];
    expect(p.source).toMatchObject({ kind: 'pdf', fileId: sources[0].id, pageIndex: 1, hasTextLayer: false });
    expect(p).toMatchObject({ rotation: 0, skewDeg: 0, flags: [], autoRotation: null, analyzed: false });
    expect(new Set(pages.map((x) => x.id)).size).toBe(3);
  });

  it('rejects encrypted pdf with code encrypted', async () => {
    const err = await importFiles([pdfFile(await encryptedPdf())]).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.code).toBe('encrypted');
  });

  it('rejects random bytes as corrupt', async () => {
    const bytes = new Uint8Array(512).map((_, i) => (i * 37 + 11) % 256);
    const err = await importFiles([pdfFile(bytes, 'junk.pdf')]).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.code).toBe('corrupt');
  });

  it('rejects unsupported file types', async () => {
    const f = new File(['hello'], 'a.txt', { type: 'text/plain' });
    const err = await importFiles([f]).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.code).toBe('unsupported');
  });

  it('imports an image as a single page, by extension when MIME is empty', async () => {
    const f = new File([new Uint8Array([1, 2, 3])], 'scan.HEIC', { type: '' });
    const { sources, pages } = await importFiles([f]);
    expect(sources[0].type).toBe('image');
    expect(pages).toHaveLength(1);
    expect(pages[0].source).toEqual({ kind: 'image', fileId: sources[0].id });
  });
});
