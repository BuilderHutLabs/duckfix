import type { Box, Mark, Stamp } from '../model/document';
import { CROSS_PATH, INK, LINE_HEIGHT, TICK_PATH, fontFrac } from './text';

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
    } else if (m.kind === 'text') {
      const px = fontFrac(m) * h;
      ctx.font = `${Math.round(px * 10) / 10}px sans-serif`;
      ctx.fillStyle = INK[m.color];
      ctx.textBaseline = 'top';
      // the line box is 1.25 font heights; the glyphs sit in its middle
      m.text.split('\n').forEach((line, i) => {
        ctx.fillText(line, m.x * w, m.y * h + (i * LINE_HEIGHT + (LINE_HEIGHT - 1) / 2) * px);
      });
    } else if (m.kind === 'check' || m.kind === 'cross') {
      const bw = m.w * w;
      const bh = m.h * h;
      ctx.strokeStyle = INK[m.color];
      ctx.lineWidth = Math.min(bw, bh) * 0.12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const line of m.kind === 'check' ? TICK_PATH : CROSS_PATH) {
        ctx.beginPath();
        line.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, m.x * w + px * bw, m.y * h + py * bh));
        ctx.stroke();
      }
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
