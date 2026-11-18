import { createWorker, OEM, type Worker } from 'tesseract.js';
import { addRotation, type Rotation } from '../model/document';
import type { OrientationDetector, OrientationResult, PageCanvas } from './detector';

/**
 * Converts tesseract.js `orientation_degrees` into the clockwise rotation that makes the page upright.
 *
 * Direction calibrated empirically (tests/orientation/tesseract.calibration.test.ts): a page whose
 * source was rotated 90 deg CW is reported as orientation_degrees = 270, and the rotation that
 * restores it is 270 deg CW. So tesseract.js already reports the CW correction: the mapping is the
 * identity (no sign flip), normalised to 0/90/180/270.
 */
export function osdToRotation(orientationDegrees: number): Rotation {
  const snapped = Math.round(orientationDegrees / 90) * 90;
  return addRotation(0, snapped);
}

export interface TesseractDetectorOptions {
  /** Base URL of the app, e.g. import.meta.env.BASE_URL ('/wduck/'). */
  basePath: string;
  workers: number;
}

function rotatedCopy(src: PageCanvas, rotation: Rotation): PageCanvas {
  if (rotation === 0) return src;
  const swap = rotation === 90 || rotation === 270;
  const w = swap ? src.height : src.width;
  const h = swap ? src.width : src.height;
  const out: PageCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180); // positive angle = clockwise on a canvas
  ctx.drawImage(src as CanvasImageSource, -src.width / 2, -src.height / 2);
  return out;
}

export async function createTesseractDetector(opts: TesseractDetectorOptions): Promise<OrientationDetector> {
  const base = opts.basePath.endsWith('/') ? opts.basePath : `${opts.basePath}/`;
  const paths = {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract`,
    langPath: `${base}tessdata`,
    gzip: false,
  };

  const osdWorkers: Worker[] = await Promise.all(
    Array.from({ length: Math.max(1, opts.workers) }, () =>
      createWorker('osd', OEM.TESSERACT_ONLY, { ...paths, legacyCore: true, legacyLang: true }),
    ),
  );

  // Free-worker queue: callers wait for a worker to be released.
  const free = [...osdWorkers];
  const waiting: Array<(w: Worker) => void> = [];
  const acquire = (): Promise<Worker> => {
    const w = free.pop();
    return w ? Promise.resolve(w) : new Promise((resolve) => waiting.push(resolve));
  };
  const release = (w: Worker) => {
    const next = waiting.shift();
    if (next) next(w);
    else free.push(w);
  };

  let ocrWorker: Promise<Worker> | null = null;
  const getOcrWorker = () => (ocrWorker ??= createWorker('pol+eng', OEM.LSTM_ONLY, paths));

  return {
    async detect(canvas): Promise<OrientationResult> {
      const w = await acquire();
      try {
        const { data } = await w.detect(canvas);
        return {
          rotation: osdToRotation(data.orientation_degrees ?? 0),
          confidence: data.orientation_confidence ?? 0,
        };
      } finally {
        release(w);
      }
    },

    async verifyUpright(canvas, candidates): Promise<Rotation> {
      const w = await getOcrWorker();
      let best = candidates[0];
      let bestScore = -1;
      for (const candidate of candidates) {
        const { data } = await w.recognize(rotatedCopy(canvas, candidate));
        const words = data.words ?? [];
        const score = words.length
          ? words.reduce((s, x) => s + x.confidence, 0) / words.length
          : (data.confidence ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best;
    },

    async dispose() {
      const ocr = ocrWorker ? await ocrWorker.catch(() => null) : null;
      await Promise.all([...osdWorkers, ...(ocr ? [ocr] : [])].map((w) => w.terminate()));
    },
  };
}
