import type { Box, Mark, Page, Stamp } from '../model/document';

export type Turn = 90 | -90 | 180;

/** Where a point of the page (fractions) lands after the page is turned clockwise by `t`. */
export function turnPoint(x: number, y: number, t: Turn): [number, number] {
  if (t === 90) return [1 - y, x];
  if (t === -90) return [y, 1 - x];
  return [1 - x, 1 - y];
}

/** A rectangle drawn on the page, turned with it. */
export function turnBox(b: Box, t: Turn): Box {
  const [ax, ay] = turnPoint(b.x, b.y, t);
  const [bx, by] = turnPoint(b.x + b.w, b.y + b.h, t);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/**
 * Text, ticks and signatures stay upright: only their centre follows the page, their real size stays.
 * `aspect` = width / height of the page before the turn.
 */
function turnUpright<T extends Box>(b: T, t: Turn, aspect: number): T {
  const [cx, cy] = turnPoint(b.x + b.w / 2, b.y + b.h / 2, t);
  const w = t === 180 ? b.w : Math.min(1, b.w * aspect);
  const h = t === 180 ? b.h : Math.min(1, b.h / aspect);
  const x = Math.min(Math.max(0, cx - w / 2), 1 - w);
  const y = Math.min(Math.max(0, cy - h / 2), 1 - h);
  return { ...b, x, y, w, h };
}

function turnMark(m: Mark, t: Turn, aspect: number): Mark {
  switch (m.kind) {
    case 'pen':
    case 'highlight': {
      const points: number[] = [];
      for (let i = 0; i + 1 < m.points.length; i += 2) points.push(...turnPoint(m.points[i], m.points[i + 1], t));
      return { ...m, points };
    }
    case 'arrow': {
      const [x, y] = turnPoint(m.x, m.y, t);
      const [ex, ey] = turnPoint(m.x + m.w, m.y + m.h, t);
      return { ...m, x, y, w: ex - x, h: ey - y };
    }
    case 'text':
    case 'check':
    case 'cross':
      return turnUpright(m, t, aspect);
    default:
      return { ...m, ...turnBox(m, t) };
  }
}

/** Everything placed on a page (marks, signatures, crop) turned along with it. */
export function turnPage(p: Page, t: Turn, aspect: number): Page {
  const out: Page = { ...p };
  if (p.marks) out.marks = p.marks.map((m) => turnMark(m, t, aspect));
  if (p.stamps) out.stamps = p.stamps.map((s: Stamp) => turnUpright(s, t, aspect));
  if (p.crop) out.crop = turnBox(p.crop, t);
  return out;
}
