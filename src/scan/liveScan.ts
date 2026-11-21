import type { Pt, Quad } from './quad';

/**
 * What the live camera sees:
 * none – no sheet; far – a sheet, but too small (come closer); hold – a sheet, waiting for a steady
 * hand; ready – steady long enough, take the picture; done – this sheet was just taken.
 */
export type LiveState = 'none' | 'far' | 'hold' | 'ready' | 'done';

/** A sheet must cover this share of the frame to be taken on its own. */
const NEAR_AREA = 0.3;
/** Corners may wander this share of the frame's longer side between frames and still count as still. */
const STILL = 0.03;
/** A change this big (share of the longer side) means a new sheet: auto-shot is armed again. */
const NEW_SHEET = 0.15;

function area(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Largest corner movement between two outlines, as a share of the frame's longer side. */
function moved(a: Quad, b: Quad, side: number): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y))) / side;
}

/** Watches the detected outline frame by frame and says when to take the picture by itself. */
export function createSteady({ holdMs = 900 }: { holdMs?: number } = {}) {
  let since: number | null = null;
  let last: Quad | null = null;
  /** The outline taken last; null when auto-shot is armed. */
  let taken: Quad | null = null;

  return {
    push(q: Quad | null, w: number, h: number, now: number): { state: LiveState; progress: number } {
      const side = Math.max(w, h);
      if (!q) {
        since = null;
        last = null;
        taken = null; // the sheet went away: the next one may be taken
        return { state: 'none', progress: 0 };
      }
      if (taken && moved(q, taken, side) > NEW_SHEET) taken = null;
      const near = area(q) / (w * h) >= NEAR_AREA;
      if (!last || moved(q, last, side) > STILL) since = now;
      last = q;
      if (!near) {
        since = null;
        return { state: 'far', progress: 0 };
      }
      if (taken) return { state: 'done', progress: 0 };
      since ??= now;
      const progress = Math.min(1, (now - since) / holdMs);
      return { state: progress >= 1 ? 'ready' : 'hold', progress };
    },
    /** The picture was taken: wait for another sheet before taking one by itself again. */
    fired() {
      taken = last;
      since = null;
    },
  };
}

/** Frame pixels → place on screen, for a video shown with object-fit: contain in a viewW × viewH box. */
export function quadToView(q: Quad, frameW: number, frameH: number, viewW: number, viewH: number): Pt[] {
  const k = Math.min(viewW / frameW, viewH / frameH);
  const left = (viewW - frameW * k) / 2;
  const top = (viewH - frameH * k) / 2;
  return q.map((p) => ({ x: left + p.x * k, y: top + p.y * k }));
}
