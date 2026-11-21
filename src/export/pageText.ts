import type { Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { getPdf } from '../imaging/render';
import type { Rasterizer } from './exportPdf';
import type { OcrEngine } from './ocr';

/**
 * Text of one page: a PDF's own text layer when it has one, otherwise recognized from the page
 * image as it will be saved (upright, straightened).
 */
export async function pageText(
  page: Page,
  source: SourceFile,
  rasterize: Rasterizer,
  ocr: () => Promise<OcrEngine>,
): Promise<string> {
  if (page.source.kind === 'pdf' && page.source.hasTextLayer) {
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
  const r = await rasterize(page, source, { compress: false });
  const engine = await ocr();
  return engine.text(new Blob([r.bytes as BlobPart], { type: r.format === 'png' ? 'image/png' : 'image/jpeg' }));
}
