export type Rotation = 0 | 90 | 180 | 270;
export type PageFlag = 'check-orientation' | 'low-text';

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
const CHECKED_BY_ROTATION: readonly PageFlag[] = ['check-orientation', 'low-text'];

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
