import { PDFDocument, degrees } from 'pdf-lib';
import { effectiveRotation, type Doc, type Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';

export type Rasterizer = (
  page: Page,
  source: SourceFile,
) => Promise<{ bytes: Uint8Array; format: 'png' | 'jpg'; widthPt: number; heightPt: number }>;

export function exportFileName(original: string): string {
  const base = original
    .replace(/\.[^./\\]*$/, '')
    // a corrected file opened again (Android may have added " (1)") keeps one suffix
    .replace(/ \(poprawiony\)( \(\d+\))?$/, '');
  return `${base} (poprawiony).pdf`;
}

function needsRaster(page: Page): boolean {
  return page.source.kind === 'image' || page.skewDeg !== 0;
}

export async function exportPdf(
  doc: Doc,
  sources: Map<string, SourceFile>,
  rasterize: Rasterizer,
  /** Called after each page with (pages done, total pages). */
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<string, Promise<PDFDocument>>();
  const loadSource = (fileId: string, source: SourceFile): Promise<PDFDocument> => {
    let p = loaded.get(fileId);
    if (!p) {
      p = source.blob.arrayBuffer().then((buf) => PDFDocument.load(buf));
      loaded.set(fileId, p);
    }
    return p;
  };

  const total = doc.pages.length;
  let done = 0;
  for (const page of doc.pages) {
    const source = sources.get(page.source.fileId);
    if (!source) throw new Error(`Missing source file ${page.source.fileId}`);

    if (needsRaster(page)) {
      const r = await rasterize(page, source);
      const image = r.format === 'png' ? await out.embedPng(r.bytes) : await out.embedJpg(r.bytes);
      const outPage = out.addPage([r.widthPt, r.heightPt]);
      outPage.drawImage(image, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
    } else if (page.source.kind === 'pdf') {
      const src = await loadSource(page.source.fileId, source);
      const [copied] = await out.copyPages(src, [page.source.pageIndex]);
      // copyPages keeps the source /Rotate; set the absolute effective value.
      copied.setRotation(degrees(effectiveRotation(page)));
      out.addPage(copied);
    }
    onProgress?.(++done, total);
  }
  return out.save();
}
