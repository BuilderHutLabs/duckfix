import type { Box, Mark, Stamp } from '../model/document';

/** Pixel rectangle of a crop on a w×h canvas: whole pixels, inside the canvas, at least 1×1. */
export function cropRect(crop: Box | undefined, w: number, h: number): { x: number; y: number; w: number; h: number } {
  if (!crop) return { x: 0, y: 0, w, h };
  const x = Math.min(w - 1, Math.max(0, Math.round(crop.x * w)));
  const y = Math.min(h - 1, Math.max(0, Math.round(crop.y * h)));
  const x1 = Math.max(x + 1, Math.min(w, Math.round((crop.x + crop.w) * w)));
  const y1 = Math.max(y + 1, Math.min(h, Math.round((crop.y + crop.h) * h)));
  return { x, y, w: x1 - x, h: y1 - y };
}

const COVER = { white: '#ffffff', black: '#000000' } as const;

/** Draws the marks of a page onto its saved image (w×h pixels, the page before crop). */
export function paintMarks(ctx: CanvasRenderingContext2D, marks: Mark[] | undefined, w: number, h: number): void {
  for (const m of marks ?? []) {
    if (m.kind === 'cover') {
      ctx.fillStyle = COVER[m.color];
      ctx.fillRect(m.x * w, m.y * h, m.w * w, m.h * h);
    }
  }
}

/** Draws the signatures of a page onto its saved image, each turned around its own centre. */
export async function paintStamps(ctx: CanvasRenderingContext2D, stamps: Stamp[] | undefined, w: number, h: number): Promise<void> {
  for (const s of stamps ?? []) {
    const img = new Image();
    img.src = s.src;
    await img.decode();
    const sw = s.w * w;
    const sh = s.h * h;
    ctx.save();
    ctx.translate(s.x * w + sw / 2, s.y * h + sh / 2);
    ctx.rotate(((s.rot ?? 0) * Math.PI) / 180);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}
