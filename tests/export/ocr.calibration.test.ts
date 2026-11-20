// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, test } from 'vitest';
import { createOcrEngine } from '../../src/export/ocr';
import { exportPdf, type Rasterizer } from '../../src/export/exportPdf';
import type { Page } from '../../src/model/document';

const langPath = resolve(__dirname, '../../public/tessdata');
const hasPol = existsSync(resolve(langPath, 'pol.traineddata'));

function textPng(): Uint8Array {
  const c = createCanvas(1400, 500);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  ctx.font = '56px sans-serif';
  ctx.fillText('Zażółć gęślą jaźń', 60, 160);
  ctx.fillText('Pchnąć w tę łódź jeża', 60, 320);
  return c.toBuffer('image/png');
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
}

describe.skipIf(!hasPol)('searchable PDF with real tesseract', () => {
  test('the exported page carries searchable Polish text over the image', async () => {
    const png = textPng();
    const engine = await createOcrEngine('pl', { langPath, gzip: false });
    try {
      const raster: Rasterizer = async () => ({ bytes: png, format: 'png', widthPt: 595, heightPt: 212 });
      const page: Page = {
        id: 'p1',
        source: { kind: 'image', fileId: 'i1' },
        rotation: 0,
        skewDeg: 0,
        flags: [],
        autoRotation: 0,
        analyzed: true,
      };
      const src = { id: 'i1', name: 'a.png', type: 'image' as const, blob: new Blob([png as BlobPart]) };
      const out = await exportPdf({ pages: [page] }, new Map([['i1', src]]), raster, undefined, { ocr: engine });
      const doc = await PDFDocument.load(out);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 212 });
      const text = await pdfText(out);
      expect(text).toContain('gęślą');
      expect(text).toContain('łódź');
    } finally {
      await engine.dispose();
    }
  }, 60_000);
});
