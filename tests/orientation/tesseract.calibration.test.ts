// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, OEM } from 'tesseract.js';
import { describe, expect, test } from 'vitest';
import { osdToRotation } from '../../src/orientation/tesseract';

const langPath = resolve(__dirname, '../../public/tessdata');
const hasOsd = existsSync(langPath) && readdirSync(langPath).some((f) => f.startsWith('osd.traineddata'));

describe('osdToRotation', () => {
  test.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [360, 0],
    [-90, 270],
    [89.9, 90],
  ])('%d -> %d', (deg, rot) => {
    expect(osdToRotation(deg)).toBe(rot);
  });
});

const LINES = [
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump today.',
  'Sphinx of black quartz, judge my vow now.',
  'Waltz, bad nymph, for quick jigs vex Bud.',
  'Grumpy wizards make toxic brew for the evil queen.',
];

/** Upright text page, then rotated clockwise by `cw` degrees (canvas positive angle = clockwise). */
function renderRotated(cw: 0 | 90 | 180 | 270) {
  const w = 1000;
  const h = 700;
  const page = createCanvas(w, h);
  const ctx = page.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.font = '32px sans-serif';
  LINES.forEach((t, i) => ctx.fillText(t, 40, 80 + i * 100));
  if (cw === 0) return page;
  const swap = cw % 180 !== 0;
  const out = createCanvas(swap ? h : w, swap ? w : h);
  const o = out.getContext('2d');
  o.translate(out.width / 2, out.height / 2);
  o.rotate((cw * Math.PI) / 180);
  o.drawImage(page, -w / 2, -h / 2);
  return out;
}

describe('tesseract OSD direction calibration', () => {
  test.skipIf(!hasOsd)(
    'rotation makes a page upright (source rotated N deg CW -> rotation (360-N) % 360)',
    async () => {
      const worker = await createWorker('osd', OEM.TESSERACT_ONLY, {
        legacyCore: true,
        legacyLang: true,
        langPath,
        gzip: false,
        cacheMethod: 'none',
      });
      try {
        for (const cw of [0, 90, 180, 270] as const) {
          const { data } = await worker.detect(renderRotated(cw).toBuffer('image/png'));
          expect(osdToRotation(data.orientation_degrees ?? -1), `source rotated ${cw} CW`).toBe((360 - cw) % 360);
          expect(data.orientation_confidence ?? 0).toBeGreaterThan(2);
        }
      } finally {
        await worker.terminate();
      }
    },
    120_000,
  );
});
