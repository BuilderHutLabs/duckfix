import { vi } from 'vitest';
import type { Doc, Page, PageFlag } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';
import type { StoreDeps } from '../../src/ui/store';
import type { DocLibrary, DocMeta } from '../../src/storage/library';
import type { StoredSession } from '../../src/storage/session';

export function page(id: string, over: Partial<Page> = {}): Page {
  return {
    id,
    source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 0, hasTextLayer: false },
    rotation: 0,
    skewDeg: 0,
    flags: [],
    autoRotation: 0,
    analyzed: true,
    ...over,
  };
}

export function docWithFlags(n: number, flagged: Record<number, PageFlag[]> = {}): Doc {
  return { pages: Array.from({ length: n }, (_, i) => page(`p${i + 1}`, { flags: flagged[i] ?? [] })) };
}

export const source: SourceFile = {
  id: 'f1',
  name: 'skan.pdf',
  type: 'pdf',
  blob: new Blob(['x']),
};

export function fakeDeps(over: Partial<StoreDeps> = {}): StoreDeps {
  return {
    importFiles: vi.fn(async () => ({ sources: [source], pages: [page('n1', { analyzed: false, autoRotation: null })] })),
    analyzePages: vi.fn(async () => {}),
    createDetector: vi.fn(async () => ({ detect: vi.fn(), dispose: vi.fn(async () => {}) })),
    exportPdf: vi.fn(async () => new Uint8Array([1])),
    exportImages: vi.fn(async () => [new Blob(['jpg'])]),
    pageText: vi.fn(async () => ''),
    pageLines: vi.fn(async () => []),
    copyText: vi.fn(async () => {}),
    createOcr: vi.fn(async () => ({ textLayer: vi.fn(), text: vi.fn(async () => ''), dispose: vi.fn(async () => {}) })),
    share: vi.fn(async () => 'downloaded' as const),
    download: vi.fn(),
    shareFirst: true,
    canShareFiles: false,
    encryptPdf: vi.fn(async (b: Uint8Array) => b),
    forgetPdf: vi.fn(async () => {}),
    storage: null,
    library: null,
    docThumb: vi.fn(async () => null),
    ...over,
  };
}

/** In-memory "Moje dokumenty"; `docs` is what IndexedDB would hold. */
export function memoryLibrary(initial: Array<{ meta: DocMeta; s: StoredSession }> = []) {
  const docs = new Map(initial.map((d) => [d.meta.id, { meta: { ...d.meta }, s: d.s }]));
  const library: DocLibrary = {
    list: vi.fn(async () => [...docs.values()].map((d) => ({ ...d.meta })).sort((a, b) => b.updatedAt - a.updatedAt)),
    save: vi.fn(async (meta: DocMeta, st: StoredSession) => {
      docs.set(meta.id, { meta: { ...meta }, s: { doc: st.doc, sources: [...st.sources] } });
    }),
    saveDoc: vi.fn(async (id: string, doc, patch: Partial<DocMeta>) => {
      const d = docs.get(id);
      if (d) docs.set(id, { meta: { ...d.meta, ...patch }, s: { ...d.s, doc } });
    }),
    patch: vi.fn(async (id: string, patch: Partial<DocMeta>) => {
      const d = docs.get(id);
      if (d) d.meta = { ...d.meta, ...patch };
    }),
    load: vi.fn(async (id: string) => docs.get(id)?.s ?? null),
    remove: vi.fn(async (id: string) => {
      docs.delete(id);
    }),
  };
  return { docs, library };
}

export const docMeta = (id: string, name: string, updatedAt: number, over: Partial<DocMeta> = {}): DocMeta => ({
  id,
  name,
  updatedAt,
  pages: 1,
  size: 1000,
  thumb: null,
  ...over,
});
