import type { PageFlag, Rotation } from '../model/document';
import type { OrientationResult } from './detector';

export interface PolicyThresholds {
  minConfidence: number;
  minInk: number;
}

/**
 * Inner ink below this is a blank page (offered for removal, never removed automatically).
 * A lone page number (~60 px on a 400 px page) stays below it; a sparse text page is ~10x above.
 */
export const BLANK_INK = 0.0015;
/** Darkest grey counted as ink on a blank check: scanner noise on white paper stays out. */
export const BLANK_MAX_THRESHOLD = 160;

export const DEFAULT_THRESHOLDS: PolicyThresholds = { minConfidence: 2.0, minInk: 0.01 };

export interface OrientationDecision {
  rotation: Rotation;
  flags: PageFlag[];
  needsVerify: boolean;
}

/**
 * - Too little ink: nothing to trust, leave the page as is and flag 'low-text'.
 * - Low OSD confidence: keep the proposed rotation but flag it and request verification.
 */
export function decideOrientation(
  r: OrientationResult,
  ink: number,
  t: PolicyThresholds = DEFAULT_THRESHOLDS,
): OrientationDecision {
  if (ink < t.minInk) return { rotation: 0, flags: ['low-text'], needsVerify: false };
  if (r.confidence < t.minConfidence) {
    return { rotation: r.rotation, flags: ['check-orientation'], needsVerify: true };
  }
  return { rotation: r.rotation, flags: [], needsVerify: false };
}
