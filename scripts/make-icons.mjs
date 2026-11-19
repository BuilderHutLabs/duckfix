// Generates the PWA icons (public/icons/*.png): a white "W" on the theme colour. Run: node scripts/make-icons.mjs
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const THEME = '#1f2937';
mkdirSync('public/icons', { recursive: true });

/** `glyph` is the fraction of the canvas the letter occupies (maskable icons need a larger safe margin). */
function icon(size, glyph, file) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  x.fillStyle = THEME;
  x.fillRect(0, 0, size, size);
  x.fillStyle = '#ffffff';
  x.font = `bold ${Math.round(size * glyph)}px sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('W', size / 2, size / 2 + size * glyph * 0.04);
  writeFileSync(`public/icons/${file}`, c.toBuffer('image/png'));
  console.log('wrote', file);
}

icon(192, 0.62, 'icon-192.png');
icon(512, 0.62, 'icon-512.png');
icon(512, 0.44, 'maskable-512.png');
