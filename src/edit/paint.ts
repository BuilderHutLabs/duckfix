import type { Box, Mark, Stamp } from '../model/document';
import { CROSS_PATH, INK, LINE_HEIGHT, TICK_PATH, fontFrac } from './text';
import { HEAD_FRAC, HIGHLIGHT, HIGHLIGHT_ALPHA, HIGHLIGHT_FRAC, PEN_FRAC, arrowHead } from './draw';

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
    } else if (m.kind === 'pen' || m.kind === 'highlight') {
      const pen = m.kind === 'pen';
      ctx.save();
      ctx.strokeStyle = pen ? INK[m.color] : HIGHLIGHT[m.color];
      ctx.lineWidth = (pen ? PEN_FRAC : HIGHLIGHT_FRAC) * w;
      ctx.globalAlpha = pen ? 1 : HIGHLIGHT_ALPHA;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(m.points[0] * w, m.points[1] * h);
      // a single tap is a dot
      if (m.points.length === 2) ctx.lineTo(m.points[0] * w + 0.01, m.points[1] * h);
      for (let i = 2; i < m.points.length; i += 2) ctx.lineTo(m.points[i] * w, m.points[i + 1] * h);
      ctx.stroke();
      ctx.restore();
    } else if (m.kind === 'rect' || m.kind === 'ellipse' || m.kind === 'arrow') {
      ctx.strokeStyle = INK[m.color];
      ctx.fillStyle = INK[m.color];
      ctx.lineWidth = PEN_FRAC * w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (m.kind === 'rect') {
        ctx.strokeRect(m.x * w, m.y * h, m.w * w, m.h * h);
      } else if (m.kind === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((m.x + m.w / 2) * w, (m.y + m.h / 2) * h, Math.abs(m.w * w) / 2, Math.abs(m.h * h) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const x0 = m.x * w, y0 = m.y * h, x1 = (m.x + m.w) * w, y1 = (m.y + m.h) * h;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const [tip, a, b] = arrowHead(x0, y0, x1, y1, HEAD_FRAC * w);
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.closePath();
        ctx.fill();
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
