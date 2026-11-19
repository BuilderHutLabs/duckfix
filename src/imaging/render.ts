import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SourceRef } from '../model/document';
import type { SourceFile } from '../import/importFiles';

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * pdf.js legacy build (library + worker): the modern build uses Promise.withResolvers etc. without
 * polyfills and needs iPadOS 17.4+. The worker is a local asset (precached by the service worker).
 */
let loader: () => Promise<PdfjsModule> = async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

const docs = new Map<string, Promise<PDFDocumentProxy>>();

/** Test seam: lets tests inject a pdf.js module. */
export function setPdfjsLoader(l: () => Promise<PdfjsModule>): void {
  loader = l;
  docs.clear();
}

export function getPdf(source: SourceFile): Promise<PDFDocumentProxy> {
  let doc = docs.get(source.id);
  if (!doc) {
    doc = (async () => {
      const [pdfjs, buf] = await Promise.all([loader(), source.blob.arrayBuffer()]);
      return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    })();
    docs.set(source.id, doc);
    doc.catch(() => docs.delete(source.id));
  }
  return doc;
}

export async function forgetPdf(fileId: string): Promise<void> {
  const doc = docs.get(fileId);
  docs.delete(fileId);
  if (doc) await (await doc.catch(() => null))?.destroy();
}

export async function renderPage(
  source: SourceFile,
  ref: SourceRef,
  maxSide: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  if (ref.kind === 'image') {
    const bmp = await createImageBitmap(source.blob, { imageOrientation: 'from-image' });
    try {
      const k = maxSide / Math.max(bmp.width, bmp.height);
      canvas.width = Math.max(1, Math.round(bmp.width * k));
      canvas.height = Math.max(1, Math.round(bmp.height * k));
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    } finally {
      bmp.close();
    }
    return canvas;
  }
  const pdf = await getPdf(source);
  const page = await pdf.getPage(ref.pageIndex + 1);
  // rotation: 0 explicitly -> raw page, ignoring the page's own /Rotate.
  const base = page.getViewport({ scale: 1, rotation: 0 });
  const viewport = page.getViewport({
    scale: maxSide / Math.max(base.width, base.height),
    rotation: 0,
  });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  page.cleanup();
  return canvas;
}

export function releaseCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}
