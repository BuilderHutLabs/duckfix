// Generates samples/test-mixed.pdf: 10 A4 pages with mixed orientations for manual UI checks.
// Usage: node scripts/make-test-pdf.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';

const A4 = [595.28, 841.89];
const LINES = [
  'The quick brown fox jumps over the lazy dog near the river bank.',
  'Scanned documents often arrive upside down or turned sideways.',
  'This page exists to test automatic orientation detection.',
  'Every line here is plain text set in a regular sans-serif font.',
  'Invoices, letters and forms usually contain many short lines.',
  'Pack my box with five dozen liquor jugs before the trip starts.',
  'How vexingly quick daft zebras jump over the wooden fence.',
  'Sphinx of black quartz, judge my vow and keep the record safe.',
];

/**
 * Each case: `content` = clockwise visual rotation of the drawn text, `rotate` = page /Rotate,
 * `text` = false for a nearly blank page. Expected upright result is noted for the manual check.
 */
const CASES = [
  { title: '1: upright', content: 0, rotate: 0 },
  { title: '2: /Rotate 90, upright content (viewers show it sideways)', content: 0, rotate: 90 },
  { title: '3: content upside down', content: 180, rotate: 0 },
  { title: '4: content turned 90 CW', content: 90, rotate: 0 },
  { title: '5: upright', content: 0, rotate: 0 },
  { title: '6: content 90 CW + /Rotate 270 (already upright in viewers)', content: 90, rotate: 270 },
  { title: '7: content turned 270 CW', content: 270, rotate: 0 },
  { title: '8: almost blank (low text)', content: 0, rotate: 0, text: false },
  { title: '9: upright, skewed 2 degrees', content: 2, rotate: 0 },
  { title: '10: /Rotate 180, upright content', content: 0, rotate: 180 },
];

function rotationMatrix(deg, cx, cy) {
  // clockwise visual rotation in PDF space (y up) = negative math angle
  const a = (-deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // translate(cx,cy) * rotate(a) * translate(-cx,-cy)
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

for (const c of CASES) {
  const page = pdf.addPage(A4);
  const [w, h] = A4;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...rotationMatrix(c.content, w / 2, h / 2)));
  // keep the text block inside a centred square so 90/270 rotations stay on the page
  const left = w / 2 - 230;
  let y = h / 2 + 230;
  page.drawText(c.title, { x: left, y, size: 14, font: bold, color: rgb(0, 0, 0) });
  y -= 30;
  if (c.text !== false) {
    for (let i = 0; i < 26; i++) {
      page.drawText(LINES[i % LINES.length], { x: left, y, size: 10.5, font, color: rgb(0, 0, 0) });
      y -= 16.5;
    }
  }
  page.pushOperators(popGraphicsState());
  if (c.rotate) page.setRotation(degrees(c.rotate));
}

await mkdir(new URL('../samples/', import.meta.url), { recursive: true });
const out = new URL('../samples/test-mixed.pdf', import.meta.url);
await writeFile(out, await pdf.save());
console.log(`wrote ${out.pathname}`);
