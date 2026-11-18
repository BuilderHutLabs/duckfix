import type { GrayImage } from '../../src/imaging/gray';

/** All-white page (255). */
export function blankPage(width: number, height: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(255), width, height };
}

type Ink = (u: number, v: number) => boolean;

/** Renders `ink(u, v)` (unrotated page coordinates) rotated CCW on screen by skewDeg about the centre. */
function rotatedPage(width: number, height: number, skewDeg: number, ink: Ink): GrayImage {
  const data = new Uint8Array(width * height).fill(255);
  const rad = (skewDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // inverse of a visual CCW rotation (y axis points down)
      const u = dx * c - dy * s + cx;
      const v = dx * s + dy * c + cy;
      if (ink(u, v)) data[y * width + x] = 0;
    }
  }
  return { data, width, height };
}

const MARGIN = 50;

function textInk(width: number, height: number): Ink {
  return (u, v) =>
    u >= MARGIN &&
    u < width - MARGIN &&
    v >= MARGIN &&
    v < height - MARGIN &&
    (v - MARGIN) % 22 < 10 &&
    (u - MARGIN) % 48 < 40;
}

/**
 * Horizontal "text lines" (black bars with word gaps) on white, rotated about
 * the page centre by `skewDeg`. Positive = counter-clockwise on screen, i.e.
 * lines tilt visually up to the right. `estimateSkew` on the result returns
 * `angleDeg ~= -skewDeg` (the clockwise correction).
 */
export function syntheticTextPage(width: number, height: number, skewDeg: number): GrayImage {
  return rotatedPage(width, height, skewDeg, textInk(width, height));
}

/** Text page whose lower-right part is a solid dark rectangle (a "photo"), rotated together with the text. */
export function textPageWithImageBlock(width: number, height: number, skewDeg: number): GrayImage {
  const text = textInk(width, height);
  const bx0 = width * 0.45;
  const bx1 = width - MARGIN;
  const by0 = height * 0.55;
  const by1 = height * 0.85;
  return rotatedPage(width, height, skewDeg, (u, v) => (u >= bx0 && u < bx1 && v >= by0 && v < by1) || text(u, v));
}

/** Table: 2 px horizontal and vertical rules on a grid, rotated by skewDeg. */
export function tableRulesPage(width: number, height: number, skewDeg: number): GrayImage {
  return rotatedPage(width, height, skewDeg, (u, v) => {
    if (u < MARGIN || u >= width - MARGIN || v < MARGIN || v >= height - MARGIN) return false;
    return (v - MARGIN) % 40 < 2 || (u - MARGIN) % 100 < 2;
  });
}

/** Deterministic salt-and-pepper noise (mulberry32 PRNG). */
export function noisePage(width: number, height: number, seed: number): GrayImage {
  let a = seed >>> 0;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    data[i] = ((t ^ (t >>> 14)) >>> 0) & 1 ? 255 : 0;
  }
  return { data, width, height };
}

/** Uniformly dark page. */
export function darkPage(width: number, height: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(20), width, height };
}
