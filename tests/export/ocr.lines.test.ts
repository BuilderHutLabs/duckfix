// @vitest-environment node
import { createCanvas } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createOcrEngine } from '../../src/export/ocr';
import { findPersonal } from '../../src/edit/personal';

const langPath = resolve(__dirname, '../../public/tessdata');
const hasPol = existsSync(resolve(langPath, 'pol.traineddata'));

function page(): Uint8Array {
  const c = createCanvas(1400, 400);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1400, 400);
  ctx.fillStyle = '#000';
  ctx.font = '44px sans-serif';
  ctx.fillText('Imię: Jan Kowalski', 60, 110);
  ctx.fillText('PESEL: 44051401359', 60, 200);
  ctx.fillText('Telefon: 601 234 567', 60, 290);
  return new Uint8Array(c.toBuffer('image/png'));
}

describe.skipIf(!hasPol)('lines of words with real tesseract', () => {
  test('words come with their boxes, and the PESEL and phone are found where they are drawn', { timeout: 120_000 }, async () => {
    const engine = await createOcrEngine('pl', { langPath, gzip: false, cacheMethod: 'none' });
    try {
      const lines = await engine.lines!(page());
      expect(lines.length).toBeGreaterThanOrEqual(3);
      const hits = findPersonal(lines);
      const pesel = hits.find((h) => h.kind === 'pesel')!;
      const phone = hits.find((h) => h.kind === 'phone')!;
      expect(pesel).toBeTruthy();
      expect(phone).toBeTruthy();
      // the PESEL sits on the second line (y around 160–210), right of "PESEL:"
      expect(pesel.y0).toBeGreaterThan(140);
      expect(pesel.y1).toBeLessThan(230);
      expect(pesel.x0).toBeGreaterThan(200);
      expect(phone.y0).toBeGreaterThan(230);
    } finally {
      await engine.dispose();
    }
  });
});
