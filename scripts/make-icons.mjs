// Generates the PWA icons (public/icons/*.png): a friendly yellow duck on a light background.
// Drawn with canvas paths only (fonts are unreliable in @napi-rs/canvas). Run: node scripts/make-icons.mjs
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const BACKGROUND = '#fff8e1';
const YELLOW = '#ffd60a';
const YELLOW_DARK = '#f2b900';
const ORANGE = '#ff9f0a';
const EYE = '#1c1c1e';
mkdirSync('public/icons', { recursive: true });

/**
 * The duck is designed in a 100 x 100 box (facing right, content spans x 8..97, y 18..86).
 * `fill` is the fraction of the canvas that box occupies: maskable icons need a larger safe margin.
 */
function icon(size, fill, file) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  x.fillStyle = BACKGROUND;
  x.fillRect(0, 0, size, size);

  const k = (size * fill) / 100;
  x.translate(size / 2 - 52.5 * k, size / 2 - 52 * k);
  x.scale(k, k);

  const ellipse = (cx, cy, rx, ry, rot = 0) => {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    x.fill();
  };

  // tail
  x.fillStyle = YELLOW;
  x.beginPath();
  x.moveTo(24, 56);
  x.lineTo(7, 40);
  x.lineTo(14, 66);
  x.closePath();
  x.fill();
  // body, head
  ellipse(46, 64, 33, 22);
  ellipse(68, 37, 19, 19);
  // beak
  x.fillStyle = ORANGE;
  ellipse(88, 42, 10.5, 5.5, 0.12);
  // wing
  x.fillStyle = YELLOW_DARK;
  ellipse(42, 65, 16, 10, -0.25);
  // eye with highlight
  x.fillStyle = EYE;
  ellipse(73, 32, 3.4, 3.4);
  x.fillStyle = '#ffffff';
  ellipse(74.1, 30.9, 1.1, 1.1);

  writeFileSync(`public/icons/${file}`, c.toBuffer('image/png'));
  console.log('wrote', file);
}

icon(192, 0.8, 'icon-192.png');
icon(512, 0.8, 'icon-512.png');
icon(512, 0.56, 'maskable-512.png');
