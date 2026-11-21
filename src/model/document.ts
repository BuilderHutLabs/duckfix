import type { ScanFilter } from '../scan/enhance';

export type Rotation = 0 | 90 | 180 | 270;
export type PageFlag = 'check-orientation' | 'low-text' | 'blank';

export type SourceRef =
  | { kind: 'pdf'; fileId: string; pageIndex: number; baseRotation: Rotation; hasTextLayer: boolean }
  | { kind: 'image'; fileId: string };

export interface Page {
  id: string;
  source: SourceRef;
  rotation: Rotation;
  skewDeg: number;
  flags: PageFlag[];
  autoRotation: Rotation | null;
  analyzed: boolean;
  /** Look of the page ("Wygląd strony"); missing = as scanned. */
  filter?: ScanFilter;
  /** Signatures placed on the page. */
  stamps?: Stamp[];
}

/**
 * An image (signature) on a page: position and size as fractions of the page as it is saved
 * (after rotation and straightening), origin top-left.
 */
export interface Stamp {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Doc {
  pages: Page[];
}

export function addRotation(a: Rotation, b: number): Rotation {
  return ((((a + b) % 360) + 360) % 360) as Rotation;
}

function mapPages(doc: Doc, ids: string[], fn: (p: Page) => Page): Doc {
  const set = new Set(ids);
  return { pages: doc.pages.map((p) => (set.has(p.id) ? fn(p) : p)) };
}

/** Flags a manual rotation resolves: the user has looked at the page ("checked"). */
const CHECKED_BY_ROTATION: readonly PageFlag[] = ['check-orientation', 'low-text', 'blank'];

export function rotatePages(doc: Doc, ids: string[], delta: 90 | -90 | 180): Doc {
  return mapPages(doc, ids, (p) => ({
    ...p,
    rotation: addRotation(p.rotation, delta),
    flags: p.flags.filter((f) => !CHECKED_BY_ROTATION.includes(f)),
  }));
}

export function movePage(doc: Doc, fromIndex: number, toIndex: number): Doc {
  const pages = [...doc.pages];
  const [moved] = pages.splice(fromIndex, 1);
  pages.splice(toIndex, 0, moved);
  return { pages };
}

/** Sets the look (Kolor / Wybielony / Czarno-biały) of the given pages. */
export function setPageFilter(doc: Doc, ids: string[], filter: ScanFilter): Doc {
  return mapPages(doc, ids, (p) => ({ ...p, filter }));
}

export function addStamp(doc: Doc, pageId: string, stamp: Stamp): Doc {
  return mapPages(doc, [pageId], (p) => ({ ...p, stamps: [...(p.stamps ?? []), stamp] }));
}

export function moveStamp(doc: Doc, pageId: string, stampId: string, box: Pick<Stamp, 'x' | 'y' | 'w' | 'h'>): Doc {
  return mapPages(doc, [pageId], (p) => ({
    ...p,
    stamps: (p.stamps ?? []).map((s) => (s.id === stampId ? { ...s, ...box } : s)),
  }));
}

export function removeStamp(doc: Doc, pageId: string, stampId: string): Doc {
  return mapPages(doc, [pageId], (p) => ({ ...p, stamps: (p.stamps ?? []).filter((s) => s.id !== stampId) }));
}

export function deletePages(doc: Doc, ids: string[]): Doc {
  const set = new Set(ids);
  return { pages: doc.pages.filter((p) => !set.has(p.id)) };
}

export function insertPages(doc: Doc, atIndex: number, pages: Page[]): Doc {
  const next = [...doc.pages];
  next.splice(atIndex, 0, ...pages);
  return { pages: next };
}

export function applyAnalysis(
  doc: Doc,
  id: string,
  r: { rotation: Rotation; skewDeg: number; flags: PageFlag[] },
): Doc {
  return mapPages(doc, [id], (p) => ({
    ...p,
    rotation: r.rotation,
    autoRotation: r.rotation,
    skewDeg: r.skewDeg,
    flags: [...r.flags],
    analyzed: true,
  }));
}

export function clearFlag(doc: Doc, id: string, flag: PageFlag): Doc {
  return mapPages(doc, [id], (p) => ({ ...p, flags: p.flags.filter((f) => f !== flag) }));
}

export function effectiveRotation(page: Page): Rotation {
  const base = page.source.kind === 'pdf' ? page.source.baseRotation : 0;
  return addRotation(base, page.rotation);
}

export function untouchedRate(doc: Doc): number {
  const analyzed = doc.pages.filter((p) => p.analyzed);
  if (analyzed.length === 0) return 0;
  return analyzed.filter((p) => p.rotation === p.autoRotation).length / analyzed.length;
}
