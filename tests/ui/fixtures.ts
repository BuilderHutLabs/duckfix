import { vi } from 'vitest';
import type { Doc, Page, PageFlag } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';
import type { StoreDeps } from '../../src/ui/store';

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
    share: vi.fn(async () => 'downloaded' as const),
    download: vi.fn(),
    shareFirst: true,
    forgetPdf: vi.fn(async () => {}),
    storage: null,
    session: null,
    ...over,
  };
}
