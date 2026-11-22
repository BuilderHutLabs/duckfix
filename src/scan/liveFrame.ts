import { toGray } from '../imaging/gray';
import { detectQuad } from './detectQuad';
import type { Quad } from './quad';

/** Side of the small grey copy of a camera frame the sheet is looked for in (fast enough several times a second on a phone). */
const LIVE_SIDE = 256;

/**
 * One look at the live camera picture: the sheet outline (in the small copy's pixels), the copy's
 * size and how bright the picture is (0–255). Null while the camera has no picture yet.
 */
export function analyzeFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): { quad: Quad | null; width: number; height: number; light: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const k = Math.min(1, LIVE_SIDE / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * k));
  const h = Math.max(1, Math.round(vh * k));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx?.getImageData) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const gray = toGray(px, w, h);
  let sum = 0;
  for (let i = 0; i < gray.data.length; i += 4) sum += gray.data[i];
  return { quad: detectQuad(gray, px), width: w, height: h, light: sum / Math.ceil(gray.data.length / 4) };
}
