import { releaseCanvas } from '../imaging/render';
import { toGray } from '../imaging/gray';
import { MAX_CANVAS_PIXELS } from '../export/rasterize';
import { detectQuad } from './detectQuad';
import { applyHomography, homography, warpSize, type Quad } from './quad';

/** A decoded camera photo: upright (EXIF applied) bitmap plus an object URL for display. */
export interface Photo {
  width: number;
  height: number;
  url: string;
  bitmap: ImageBitmap;
  close(): void;
}

/** Longest side of the copy the sheet is searched in. */
const DETECT_SIDE = 400;
/** Longest side of the source copy the warp samples from (iPad memory). */
const SOURCE_SIDE = 3200;
const JPEG_QUALITY = 0.85;

function canvas(w: number, h: number): HTMLCanvasElement {
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // e.g. HEIC where createImageBitmap cannot decode it but <img> can (Safari)
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function loadPhoto(file: Blob): Promise<Photo> {
  const bitmap = await decode(file);
  const url = URL.createObjectURL(file);
  return {
    width: bitmap.width,
    height: bitmap.height,
    url,
    bitmap,
    close() {
      bitmap.close();
      URL.revokeObjectURL(url);
    },
  };
}

/** Sheet corners in photo pixels, searched in a ≤ 400 px grey copy; null when not found. */
export function findSheet(photo: Photo): Quad | null {
  const k = Math.min(1, DETECT_SIDE / Math.max(photo.width, photo.height));
  const c = canvas(Math.max(1, Math.round(photo.width * k)), Math.max(1, Math.round(photo.height * k)));
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(photo.bitmap, 0, 0, c.width, c.height);
    const q = detectQuad(toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
    return q && (q.map((p) => ({ x: p.x / k, y: p.y / k })) as Quad);
  } finally {
    releaseCanvas(c);
  }
}

/** Straightens the sheet inside `q` (photo pixels) into an upright JPEG. */
export async function warpToBlob(photo: Photo, q: Quad): Promise<Blob> {
  const { w, h } = warpSize(q);
  // sample from a copy no larger than needed (and within the canvas budget)
  const k = Math.min(1, SOURCE_SIDE / Math.max(photo.width, photo.height), Math.sqrt(MAX_CANVAS_PIXELS / 2 / (photo.width * photo.height)));
  const sw = Math.max(1, Math.round(photo.width * k));
  const sh = Math.max(1, Math.round(photo.height * k));
  const src = canvas(sw, sh);
  const out = canvas(w, h);
  try {
    const sctx = src.getContext('2d', { willReadFrequently: true })!;
    sctx.drawImage(photo.bitmap, 0, 0, sw, sh);
    const s = sctx.getImageData(0, 0, sw, sh).data;
    releaseCanvas(src);

    const octx = out.getContext('2d')!;
    const o = octx.createImageData(w, h);
    // output pixel -> photo pixel (scaled copy)
    const rect: Quad = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    const H = homography(rect, q.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = applyHomography(H, { x: x + 0.5, y: y + 0.5 });
        const fx = Math.min(sw - 1.001, Math.max(0, p.x - 0.5));
        const fy = Math.min(sh - 1.001, Math.max(0, p.y - 0.5));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const ax = fx - x0;
        const ay = fy - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sw * 4;
        const i11 = i01 + 4;
        const di = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
          const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
          o.data[di + c] = top + (bot - top) * ay;
        }
        o.data[di + 3] = 255;
      }
    }
    octx.putImageData(o, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
    );
  } finally {
    releaseCanvas(src);
    releaseCanvas(out);
  }
}
