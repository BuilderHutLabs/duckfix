/**
 * "Dowód": both sides of an ID card (or any card: ID-1 format, 85.6 × 54 mm) photographed one after
 * the other land on one A4 page at their real size, front above back — what banks and offices ask for.
 */

/** A4 at 200 dpi (pixels). */
export const A4 = { w: 1654, h: 2339 };
/** Width : height of an ID-1 card. */
export const CARD_RATIO = 85.6 / 54;
const MM = A4.w / 210;

export interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where each side goes on the page (pixels of A4). */
export function cardLayout(count: number): CardBox[] {
  const w = Math.round(85.6 * MM);
  const h = Math.round(54 * MM);
  const x = Math.round((A4.w - w) / 2);
  const top = Math.round(40 * MM); // 4 cm from the top
  const gap = Math.round(20 * MM);
  return Array.from({ length: Math.max(1, Math.min(2, count)) }, (_, i) => ({ x, y: top + i * (h + gap), w, h }));
}

/** The A4 page with the sides drawn in (JPEG). A side shot upright is turned to lie flat. */
export async function composeIdCard(sides: Blob[]): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = A4.w;
  c.height = A4.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4.w, A4.h);
  const boxes = cardLayout(sides.length);
  for (const [i, blob] of sides.slice(0, 2).entries()) {
    const img = await createImageBitmap(blob);
    const b = boxes[i];
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    const upright = img.height > img.width;
    if (upright) ctx.rotate(-Math.PI / 2);
    // the straightened photo fills the card box (its proportions are the card's, near enough)
    ctx.drawImage(img, -b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
    // a thin grey edge, like a photocopy of a card
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    img.close();
  }
  const out = await new Promise<Blob>((resolve, reject) =>
    c.toBlob((x) => (x ? resolve(x) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );
  c.width = 0;
  return out;
}
