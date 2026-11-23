import { qrMatrix } from './qr';

/** Pixels per module and the light margin around the code (4 modules, as readers expect). */
const CELL = 12;
const QUIET = 4;

/** A QR code as a PNG (data URL): black modules on white, so it reads on any page; square. */
export function qrImage(text: string): { src: string; aspect: number } {
  const m = qrMatrix(text);
  const n = m.length;
  const side = (n + 2 * QUIET) * CELL;
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (m[r][col]) ctx.fillRect((col + QUIET) * CELL, (r + QUIET) * CELL, CELL, CELL);
    }
  }
  const src = c.toDataURL('image/png');
  c.width = 0;
  return { src, aspect: 1 };
}
