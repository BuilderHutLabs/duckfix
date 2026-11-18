import { addRotation, type Page, type PageFlag, type Rotation, type SourceRef } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { releaseCanvas, type renderPage } from '../imaging/render';
import { inkRatio, otsuThreshold, toGray, type GrayImage } from '../imaging/gray';
import { MIN_SKEW_SCORE, estimateSkew } from '../imaging/deskew';
import type { OrientationDetector } from '../orientation/detector';
import { decideOrientation, type PolicyThresholds } from '../orientation/policy';
import { runQueue } from './queue';

export interface PageAnalysis {
  pageId: string;
  /** Model-frame rotation: add to source.baseRotation to get the upright rotation. */
  rotation: Rotation;
  skewDeg: number;
  flags: PageFlag[];
  confidence: number;
  ms: number;
}

export interface AnalyzeDeps {
  render: typeof renderPage;
  release: typeof releaseCanvas;
  detector: OrientationDetector;
  thresholds: PolicyThresholds;
  getSource(fileId: string): SourceFile;
  /** Grayscale of the canvas rotated clockwise by `rotation`. */
  toGrayImage(canvas: HTMLCanvasElement, rotation: Rotation): GrayImage;
}

export interface AnalyzeOptions {
  concurrency: number;
  maxSide: number;
  deskew: boolean;
  signal?: AbortSignal;
}

const MIN_SKEW_DEG = 0.3;

/** Browser implementation of `AnalyzeDeps.toGrayImage`; the temporary canvas is always released. */
export function canvasToGrayImage(canvas: HTMLCanvasElement, rotation: Rotation): GrayImage {
  const swap = rotation === 90 || rotation === 270;
  const tmp = document.createElement('canvas');
  try {
    tmp.width = swap ? canvas.height : canvas.width;
    tmp.height = swap ? canvas.width : canvas.height;
    const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
    ctx.translate(tmp.width / 2, tmp.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    const { data } = ctx.getImageData(0, 0, tmp.width, tmp.height);
    return toGray(data, tmp.width, tmp.height);
  } finally {
    releaseCanvas(tmp);
  }
}

function pdfInfo(src: SourceRef): { baseRotation: Rotation; hasTextLayer: boolean } {
  return src.kind === 'pdf'
    ? { baseRotation: src.baseRotation, hasTextLayer: src.hasTextLayer }
    : { baseRotation: 0, hasTextLayer: false };
}

async function analyzeOne(
  page: Page,
  deps: AnalyzeDeps,
  opts: AnalyzeOptions,
): Promise<PageAnalysis> {
  const t0 = performance.now();
  const { baseRotation, hasTextLayer } = pdfInfo(page.source);
  let canvas: HTMLCanvasElement | undefined;
  try {
    // render is raw (ignores /Rotate), so detector rotations are in the raw frame.
    canvas = await deps.render(deps.getSource(page.source.fileId), page.source, opts.maxSide);
    const result = await deps.detector.detect(canvas);

    // Ink ratio is rotation-invariant: computed once on the raw image.
    const raw = deps.toGrayImage(canvas, 0);
    const ink = inkRatio(raw, otsuThreshold(raw));

    const decision = decideOrientation(result, ink, deps.thresholds);
    let rawRotation = decision.rotation;
    if (decision.needsVerify && deps.detector.verifyUpright) {
      rawRotation = await deps.detector.verifyUpright(canvas, [rawRotation, addRotation(rawRotation, 180)]);
    }

    let skewDeg = 0;
    if (opts.deskew && !hasTextLayer) {
      const est = estimateSkew(deps.toGrayImage(canvas, rawRotation));
      if (est.score >= MIN_SKEW_SCORE && Math.abs(est.angleDeg) > MIN_SKEW_DEG) skewDeg = est.angleDeg;
    }

    return {
      pageId: page.id,
      rotation: addRotation(rawRotation, -baseRotation),
      skewDeg,
      flags: decision.flags,
      confidence: result.confidence,
      ms: performance.now() - t0,
    };
  } catch {
    return {
      pageId: page.id,
      rotation: 0,
      skewDeg: 0,
      flags: ['check-orientation'],
      confidence: 0,
      ms: performance.now() - t0,
    };
  } finally {
    if (canvas) deps.release(canvas);
  }
}

/** Analyzes pages concurrently, skipping already analyzed ones (resume). */
export async function analyzePages(
  pages: Page[],
  deps: AnalyzeDeps,
  onResult: (a: PageAnalysis) => void,
  opts: AnalyzeOptions,
): Promise<void> {
  const todo = pages.filter((p) => !p.analyzed);
  await runQueue(
    todo,
    opts.concurrency,
    async (page) => onResult(await analyzeOne(page, deps, opts)),
    opts.signal,
  );
}
