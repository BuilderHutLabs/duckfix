import { PDFDocument, degrees } from 'pdf-lib';
import { effectiveRotation, type Doc, type Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { DICTS, strings } from '../i18n';
import type { OcrEngine } from './ocr';

export type Rasterizer = (
  page: Page,
  source: SourceFile,
  opts?: { compress: boolean },
) => Promise<{ bytes: Uint8Array; format: 'png' | 'jpg'; widthPt: number; heightPt: number }>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The "(poprawiony)" suffix of any language, plus " (1)" that Android may add. */
const ANY_SUFFIX = new RegExp(`(${Object.values(DICTS).map((d) => escapeRe(d.exportSuffix)).join('|')})( \\(\\d+\\))?$`);

export function exportFileName(original: string, suffix: string = strings.exportSuffix): string {
  // a corrected file opened again keeps one suffix
  const base = original.replace(/\.[^./\\]*$/, '').replace(ANY_SUFFIX, '');
  return `${base}${suffix}.pdf`;
}

function needsRaster(page: Page): boolean {
  return page.source.kind === 'image' || page.skewDeg !== 0;
}

/** A PDF page copied as is keeps its own text; anything else has none until OCR adds it. */
function hasOwnText(page: Page): boolean {
  return page.source.kind === 'pdf' && page.source.hasTextLayer && !needsRaster(page);
}

export async function exportPdf(
  doc: Doc,
  sources: Map<string, SourceFile>,
  rasterize: Rasterizer,
  /** Called after each page with (pages done, total pages). */
  onProgress?: (done: number, total: number) => void,
  opts: { compress?: boolean; ocr?: OcrEngine; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const compress = opts.compress === true;
  opts.signal?.throwIfAborted();
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

    // with OCR, a scanned PDF page without text is rasterized too, so it can be recognized
    const ocrThis = opts.ocr && !hasOwnText(page);
    if (compress || needsRaster(page) || ocrThis) {
      const r = await rasterize(page, source, { compress });
      const image = r.format === 'png' ? await out.embedPng(r.bytes) : await out.embedJpg(r.bytes);
      const outPage = out.addPage([r.widthPt, r.heightPt]);
      outPage.drawImage(image, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
      if (ocrThis && opts.ocr) {
        // a page that originally had text and is now an image (compress/skew) also gets recognized
        const layer = await opts.ocr.textLayer(new Blob([r.bytes as BlobPart], { type: `image/${r.format === 'png' ? 'png' : 'jpeg'}` }));
        const [text] = await out.embedPdf(layer);
        outPage.drawPage(text, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
      }
    } else if (page.source.kind === 'pdf') {
      const src = await loadSource(page.source.fileId, source);
      const [copied] = await out.copyPages(src, [page.source.pageIndex]);
      // copyPages keeps the source /Rotate; set the absolute effective value.
      copied.setRotation(degrees(effectiveRotation(page)));
      out.addPage(copied);
    }
    onProgress?.(++done, total);
    opts.signal?.throwIfAborted();
  }
  return out.save();
}
