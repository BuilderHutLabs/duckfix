import { effectiveRotation } from '../model/document';
import { releaseCanvas, renderPage, getPdf } from '../imaging/render';
import { isNearBitonal, toGray } from '../imaging/gray';
import type { Rasterizer } from './exportPdf';

const DPI = 300;
const PT_PER_PX = 72 / DPI;
const IMAGE_MAX_SIDE = 3508; // A4 @ 300 DPI
const A4 = { w: 595.28, h: 841.89 };

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  );
}

/** Longest side (px) to render the raw page at: 300 DPI (PDF) or native capped to A4@300 (image). */
async function rawMaxSide(
  page: Parameters<Rasterizer>[0],
  source: Parameters<Rasterizer>[1],
): Promise<number> {
  if (page.source.kind === 'image') {
    const bmp = await createImageBitmap(source.blob, { imageOrientation: 'from-image' });
    try {
      return Math.min(IMAGE_MAX_SIDE, Math.max(bmp.width, bmp.height));
    } finally {
      bmp.close();
    }
  }
  const pdf = await getPdf(source);
  const p = await pdf.getPage(page.source.pageIndex + 1);
  const v = p.getViewport({ scale: 1, rotation: 0 });
  p.cleanup();
  return Math.max(v.width, v.height) * (DPI / 72);
}

export const browserRasterizer: Rasterizer = async (page, source) => {
  const raw = await renderPage(source, page.source, await rawMaxSide(page, source));
  try {
    return await finish(raw, page);
  } finally {
    releaseCanvas(raw);
  }
};

async function finish(raw: HTMLCanvasElement, page: Parameters<Rasterizer>[0]) {
  const angle = ((effectiveRotation(page) + page.skewDeg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = Math.max(1, Math.ceil(raw.width * cos + raw.height * sin));
  const h = Math.max(1, Math.ceil(raw.width * sin + raw.height * cos));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  try {
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle); // canvas rotate is clockwise for positive angles
    ctx.drawImage(raw, -raw.width / 2, -raw.height / 2);

    const gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h);
    const png = isNearBitonal(gray);
    const blob = png ? await toBlob(out, 'image/png') : await toBlob(out, 'image/jpeg', 0.9);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let widthPt: number;
    let heightPt: number;
    if (page.source.kind === 'pdf') {
      widthPt = w * PT_PER_PX;
      heightPt = h * PT_PER_PX;
    } else {
      const box = w > h ? { w: A4.h, h: A4.w } : A4;
      const k = Math.min(box.w / w, box.h / h);
      widthPt = w * k;
      heightPt = h * k;
    }
    return { bytes, format: png ? ('png' as const) : ('jpg' as const), widthPt, heightPt };
  } finally {
    releaseCanvas(out);
  }
}
