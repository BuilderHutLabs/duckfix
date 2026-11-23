import { LEVELS, MAX_LEVEL } from './rasterize';
import { paintWatermark } from './watermark';
import type { Doc } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import type { Rasterizer } from './exportPdf';

/**
 * "JPG": every page as a picture, exactly as it would be saved in the PDF (rotation, straightening,
 * look, signatures, marks and crop included — the rasterizer draws them).
 */
export async function exportImages(
  doc: Doc,
  sources: Map<string, SourceFile>,
  rasterize: Rasterizer,
  onProgress?: (done: number, total: number) => void,
  opts: { compress?: number; signal?: AbortSignal; watermark?: string } = {},
): Promise<Blob[]> {
  const out: Blob[] = [];
  const total = doc.pages.length;
  for (const page of doc.pages) {
    opts.signal?.throwIfAborted();
    const source = sources.get(page.source.fileId);
    if (!source) throw new Error(`Missing source file ${page.source.fileId}`);
    const r = await rasterize(page, source, { compress: opts.compress ?? 0 });
    out.push(await toJpeg(r.bytes, r.format, opts.compress ?? 0, opts.watermark));
    onProgress?.(out.length, total);
  }
  return out;
}

async function toJpeg(bytes: Uint8Array, format: 'png' | 'jpg', compress: number, watermark?: string): Promise<Blob> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: format === 'png' ? 'image/png' : 'image/jpeg' }));
  const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  try {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    if (watermark) paintWatermark(ctx, watermark, c.width, c.height);
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', LEVELS[Math.min(MAX_LEVEL, compress)].quality),
    );
  } finally {
    c.width = 0;
    c.height = 0;
  }
}
