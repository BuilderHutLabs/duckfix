import type { Rotation } from '../model/document';

export type PageCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface OrientationResult {
  /** Clockwise rotation to apply so the page ends up upright. */
  rotation: Rotation;
  confidence: number;
}

export interface OrientationDetector {
  detect(canvas: PageCanvas): Promise<OrientationResult>;
  /** Picks the more plausible of two candidate rotations by recognizing text in both. */
  verifyUpright?(canvas: PageCanvas, candidates: [Rotation, Rotation]): Promise<Rotation>;
  dispose(): Promise<void>;
}
