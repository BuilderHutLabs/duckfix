// @vitest-environment node
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { estimateSkew } from '../../src/imaging/deskew';
import { toGray } from '../../src/imaging/gray';

const W = 800;
const H = 1100;
const rad = (d: number) => (d * Math.PI) / 180;

function drawBars(ctx: ReturnType<Canvas['getContext']>) {
  ctx.fillStyle = '#000';
  for (let y = 60; y < H - 60; y += 22) {
    for (let x = 60; x < W - 100; x += 48) ctx.fillRect(x, y, 40, 10);
  }
}

function skewOf(canvas: Canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, W, H);
  return estimateSkew(toGray(new Uint8ClampedArray(data), W, H));
}

function rotatedAboutCentre(source: Canvas | null, deg: number): Canvas {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rad(deg));
  ctx.translate(-W / 2, -H / 2);
  if (source) ctx.drawImage(source, 0, 0);
  else drawBars(ctx);
  return canvas;
}

describe('estimateSkew vs real canvas rotation (independent of test helpers)', () => {
  it('content rotated clockwise by +2 deg gives angleDeg ~ -2, and applying it straightens the page', () => {
    const skewed = rotatedAboutCentre(null, 2);
    const { angleDeg } = skewOf(skewed);
    expect(Math.abs(angleDeg + 2)).toBeLessThan(0.3);

    const corrected = rotatedAboutCentre(skewed, angleDeg);
    expect(Math.abs(skewOf(corrected).angleDeg)).toBeLessThan(0.3);
  });
});
