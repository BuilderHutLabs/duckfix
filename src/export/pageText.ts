import type { OcrLine } from '../edit/personal';
import type { Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { getPdf } from '../imaging/render';
import type { Rasterizer } from './exportPdf';
import type { OcrEngine } from './ocr';

/**
 * The page as it will be saved (covers, crop, rotation applied), recognised into lines of words.
 * Boxes are fractions of that picture (0…1), for "Ukryj dane osobowe".
 */
export async function pageLines(page: Page, source: SourceFile, rasterize: Rasterizer, ocr: () => Promise<OcrEngine>): Promise<OcrLine[]> {
  const r = await rasterize(page, source, { compress: 0 });
  const engine = await ocr();
  if (!engine.lines) return [];
  const blob = new Blob([r.bytes as BlobPart], { type: r.format === 'png' ? 'image/png' : 'image/jpeg' });
  const { width, height } = await imageSize(blob);
  const lines = await engine.lines(blob);
  return lines.map((l) => ({
    words: l.words.map((w) => ({
      text: w.text,
      bbox: { x0: w.bbox.x0 / width, y0: w.bbox.y0 / height, x1: w.bbox.x1 / width, y1: w.bbox.y1 / height },
    })),
  }));
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

/**
 * Text of one page: a PDF's own text layer when it has one, otherwise recognized from the page
 * image as it will be saved (upright, straightened).
 */
export async function pageText(page: Page, source: SourceFile, rasterize: Rasterizer, ocr: () => Promise<OcrEngine>): Promise<string> {
  // a cover or crop hides part of the page: read only what will be saved, never the PDF's own text
  const hidden = page.crop !== undefined || (page.marks ?? []).some((m) => m.kind === 'cover');
  if (page.source.kind === 'pdf' && page.source.hasTextLayer && !hidden) {
    const pdf = await getPdf(source);
    const p = await pdf.getPage(page.source.pageIndex + 1);
    const content = await p.getTextContent();
    p.cleanup();
    let out = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      out += item.str + (item.hasEOL ? '\n' : ' ');
    }
    return out.replace(/[ \t]+\n/g, '\n');
  }
  const r = await rasterize(page, source, { compress: 0 });
  const engine = await ocr();
  return engine.text(new Blob([r.bytes as BlobPart], { type: r.format === 'png' ? 'image/png' : 'image/jpeg' }));
}
