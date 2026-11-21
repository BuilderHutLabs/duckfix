import type { Doc, Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import type { Rasterizer } from './exportPdf';

/**
 * "JPG": every page as a picture, exactly as it would be saved in the PDF (rotation, straightening,
 * look and signatures included).
 */
export async function exportImages(
  doc: Doc,
  sources: Map<string, SourceFile>,
  rasterize: Rasterizer,
  onProgress?: (done: number, total: number) => void,
  opts: { compress?: boolean; signal?: AbortSignal } = {},
): Promise<Blob[]> {
  const out: Blob[] = [];
  const total = doc.pages.length;
  for (const page of doc.pages) {
    opts.signal?.throwIfAborted();
    const source = sources.get(page.source.fileId);
    if (!source) throw new Error(`Missing source file ${page.source.fileId}`);
    const r = await rasterize(page, source, { compress: opts.compress === true });
    out.push(await toJpeg(r.bytes, r.format, page, opts.compress === true));
    onProgress?.(out.length, total);
  }
  return out;
}

async function toJpeg(bytes: Uint8Array, format: 'png' | 'jpg', page: Page, compress: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: format === 'png' ? 'image/png' : 'image/jpeg' }));
  const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  try {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    for (const s of page.stamps ?? []) {
      const img = new Image();
      img.src = s.src;
      await img.decode();
      ctx.drawImage(img, s.x * c.width, s.y * c.height, s.w * c.width, s.h * c.height);
    }
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', compress ? 0.7 : 0.9),
    );
  } finally {
    c.width = 0;
    c.height = 0;
  }
}
