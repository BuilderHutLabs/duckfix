import type { WatermarkImage } from './exportPdf';

/** The watermark line: the user's text and today's date ("Kopia dla banku – 22.11.2026"). */
export function watermarkLine(text: string, lang: string, today = new Date()): string {
  return `${text.trim()} – ${today.toLocaleDateString(lang)}`;
}

const FONT = '700 72px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const COLOR = '#4a4a4a';

/** The line drawn as a picture (any letters the phone's font has: ą, ł, ß, ñ…), transparent around. */
export async function watermarkPng(line: string): Promise<WatermarkImage> {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(line).width) + 48;
  c.width = w;
  c.height = 110;
  ctx.font = FONT;
  ctx.fillStyle = COLOR;
  ctx.textBaseline = 'middle';
  ctx.fillText(line, 24, 56);
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
  const png = new Uint8Array(await blob.arrayBuffer());
  c.width = 0;
  return { png, width: w, height: 110 };
}

/** The same watermark drawn straight onto a page picture (JPG export): three lines along the diagonal. */
export function paintWatermark(ctx: CanvasRenderingContext2D, line: string, w: number, h: number): void {
  const diag = Math.hypot(w, h);
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // font size so one line covers ~50 % of the diagonal (the outer lines stay inside the page)
  ctx.font = FONT;
  const k = (diag * 0.5) / Math.max(1, ctx.measureText(line).width);
  ctx.font = FONT.replace('72px', `${Math.round(72 * k)}px`);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.atan2(h, w));
  for (const off of [-0.25, 0, 0.25]) ctx.fillText(line, 0, off * Math.min(w, h));
  ctx.restore();
}
