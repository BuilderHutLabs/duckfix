import { effectiveRotation } from '../model/document';
import { releaseCanvas, renderPage, getPdf } from '../imaging/render';
import { isNearBitonal, toGray } from '../imaging/gray';
import type { Rasterizer } from './exportPdf';

const DPI = 300;
const IMAGE_MAX_SIDE = 3508; // A4 @ 300 DPI
const A4 = { w: 595.28, h: 841.89 };

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  );
}

export const MAX_CANVAS_PIXELS = 16_000_000; // stay under iOS Safari's ~16.7 MP canvas limit

/** Exact (unrounded) bounding box of a w x h rectangle rotated CW by deg; trig noise snapped to 0. */
export function rotatedBox(w: number, h: number, deg: number): { w: number; h: number } {
  const rad = (deg * Math.PI) / 180;
  const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v));
  const cos = snap(Math.cos(rad));
  const sin = snap(Math.sin(rad));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

/** Output canvas size in whole pixels: exact for right angles, ceil for skewed. */
export function rotatedSize(w: number, h: number, deg: number): { w: number; h: number } {
  const b = rotatedBox(w, h, deg);
  return { w: Math.max(1, Math.ceil(b.w - 1e-6)), h: Math.max(1, Math.ceil(b.h - 1e-6)) };
}

/**
 * Longest side (px) for the raw render: `desiredMaxSide`, reduced so that the rotated
 * output area stays within `budget` pixels.
 */
export function budgetedMaxSide(
  rawW: number,
  rawH: number,
  deg: number,
  desiredMaxSide: number,
  budget: number = MAX_CANVAS_PIXELS,
): number {
  const k = desiredMaxSide / Math.max(rawW, rawH);
  const box = rotatedBox(rawW * k, rawH * k, deg);
  const area = (box.w + 1) * (box.h + 1); // +1: ceil / render rounding
  if (area <= budget) return desiredMaxSide;
  return desiredMaxSide * Math.sqrt(budget / area);
}

/** Raw (unrotated) page dimensions: points for PDF, native pixels for image. */
async function rawDimensions(
  page: Parameters<Rasterizer>[0],
  source: Parameters<Rasterizer>[1],
): Promise<{ w: number; h: number; desiredMaxSide: number }> {
  if (page.source.kind === 'image') {
    const bmp = await createImageBitmap(source.blob, { imageOrientation: 'from-image' });
    try {
      const m = Math.max(bmp.width, bmp.height);
      return { w: bmp.width, h: bmp.height, desiredMaxSide: Math.min(IMAGE_MAX_SIDE, m) };
    } finally {
      bmp.close();
    }
  }
  const pdf = await getPdf(source);
  const p = await pdf.getPage(page.source.pageIndex + 1);
  const v = p.getViewport({ scale: 1, rotation: 0 });
  p.cleanup();
  return { w: v.width, h: v.height, desiredMaxSide: Math.max(v.width, v.height) * (DPI / 72) };
}

export const browserRasterizer: Rasterizer = async (page, source) => {
  const dims = await rawDimensions(page, source);
  const deg = effectiveRotation(page) + page.skewDeg;
  const maxSide = budgetedMaxSide(dims.w, dims.h, deg, dims.desiredMaxSide);
  const raw = await renderPage(source, page.source, maxSide);
  try {
    return await finish(raw, page, deg, dims);
  } finally {
    releaseCanvas(raw);
  }
};

async function finish(
  raw: HTMLCanvasElement,
  page: Parameters<Rasterizer>[0],
  deg: number,
  dims: { w: number; h: number },
) {
  const angle = (deg * Math.PI) / 180;
  const { w, h } = rotatedSize(raw.width, raw.height, deg);
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
    releaseCanvas(raw); // free the raw render before encoding (peak memory on iPad)

    const gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h);
    const png = isNearBitonal(gray);
    const blob = png ? await toBlob(out, 'image/png') : await toBlob(out, 'image/jpeg', 0.9);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let widthPt: number;
    let heightPt: number;
    if (page.source.kind === 'pdf') {
      // true physical size, independent of the (budgeted) render DPI
      const box = rotatedBox(dims.w, dims.h, deg);
      widthPt = box.w;
      heightPt = box.h;
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
