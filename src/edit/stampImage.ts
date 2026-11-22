import { stampLines, type StampInk, type StampKind } from './stamps';

const INK: Record<StampInk, string> = { red: '#c8102e', blue: '#1f4aa8' };
/** Height of the main line's letters, px (drawn large, shown small: sharp when printed). */
const U = 64;
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PAD_X = 0.55 * U;
const PAD_Y = 0.4 * U;
const GAP = 0.22 * U;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A ready-made stamp as a transparent PNG (data URL) with its width/height ratio. */
export function stampImage(kind: StampKind, ink: StampInk, day: Date = new Date()): { src: string; aspect: number } {
  const lines = stampLines(kind, day);
  const measure = document.createElement('canvas').getContext('2d')!;
  const font = (size: number, sign = false) => `${sign ? 500 : 800} ${Math.round(size * U)}px ${FONT}`;
  // the signature line is dots with "podpis" under it
  const rows = lines.flatMap((l) =>
    l.kind === 'sign'
      ? [
          { text: l.text.split('\n')[0], size: 0.5, sign: true, dots: true },
          { text: l.text.split('\n')[1] ?? '', size: l.size, sign: true, dots: false },
        ]
      : [{ text: l.text, size: l.size, sign: false, dots: false }],
  );
  const widths = rows.map((r) => {
    measure.font = font(r.size, r.sign);
    return r.dots ? 0 : measure.measureText(r.text).width + (r.sign ? 0 : r.text.length * 0.04 * U * r.size);
  });
  const inner = Math.max(...widths, 3 * U);
  const w = Math.ceil(inner + 2 * PAD_X);
  const h = Math.ceil(rows.reduce((n, r) => n + r.size * U * 1.12, 0) + GAP * (rows.length - 1) + 2 * PAD_Y);

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.globalAlpha = 0.9; // a little like ink
  ctx.strokeStyle = INK[ink];
  ctx.fillStyle = INK[ink];
  ctx.lineWidth = 0.09 * U;
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, 0.22 * U);
  ctx.stroke();
  ctx.lineWidth = 0.03 * U;
  const inset = 0.17 * U;
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, 0.14 * U);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = PAD_Y;
  for (const r of rows) {
    const lh = r.size * U * 1.12;
    if (r.dots) {
      ctx.save();
      ctx.lineWidth = 0.035 * U;
      ctx.setLineDash([0.06 * U, 0.08 * U]);
      ctx.beginPath();
      ctx.moveTo(w * 0.18, y + lh * 0.75);
      ctx.lineTo(w * 0.82, y + lh * 0.75);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.font = font(r.size, r.sign);
      if ('letterSpacing' in ctx && !r.sign) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${0.04 * U * r.size}px`;
      ctx.fillText(r.text, w / 2, y + lh / 2);
      if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    }
    y += lh + GAP;
  }
  return { src: c.toDataURL('image/png'), aspect: w / h };
}
