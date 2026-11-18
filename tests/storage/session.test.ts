// @vitest-environment node
// Node's Blob is structured-cloneable (jsdom's is not), matching what Safari stores in IndexedDB.
import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { clearSession, loadSession, saveSession, saveSessionDoc } from '../../src/storage/session';
import type { Doc } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';

const doc: Doc = {
  pages: [
    {
      id: 'p1',
      source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 90, hasTextLayer: true },
      rotation: 180,
      skewDeg: -1.4,
      flags: ['check-orientation'],
      autoRotation: 180,
      analyzed: true,
    },
    {
      id: 'p2',
      source: { kind: 'image', fileId: 'f2' },
      rotation: 0,
      skewDeg: 0,
      flags: [],
      autoRotation: null,
      analyzed: false,
    },
  ],
};

const sources: SourceFile[] = [
  { id: 'f1', name: 'skan.pdf', type: 'pdf', blob: new Blob([new Uint8Array(1234)], { type: 'application/pdf' }) },
  { id: 'f2', name: 'foto.jpg', type: 'image', blob: new Blob([new Uint8Array(77)], { type: 'image/jpeg' }) },
];

afterEach(async () => {
  await clearSession();
  vi.restoreAllMocks();
});

describe('session storage', () => {
  it('save → load returns an equal doc and blobs of the same sizes', async () => {
    await saveSession({ doc, sources });
    const s = await loadSession();
    expect(s).not.toBeNull();
    expect(s!.doc).toEqual(doc);
    expect(s!.sources.map(({ id, name, type }) => ({ id, name, type }))).toEqual(
      sources.map(({ id, name, type }) => ({ id, name, type })),
    );
    expect(s!.sources.map((x) => x.blob.size)).toEqual([1234, 77]);
    expect(s!.sources[0].blob.type).toBe('application/pdf');
  });

  it('saveSessionDoc replaces only the doc', async () => {
    await saveSession({ doc, sources });
    const next: Doc = { pages: [doc.pages[1]] };
    await saveSessionDoc(next);
    const s = await loadSession();
    expect(s!.doc).toEqual(next);
    expect(s!.sources).toHaveLength(2);
  });

  it('clear → load is null', async () => {
    await saveSession({ doc, sources });
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  it('load is null when nothing was saved', async () => {
    expect(await loadSession()).toBeNull();
  });

  it('never throws when IndexedDB fails (private mode)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    // a fresh module instance so the store re-opens the (now failing) database
    vi.resetModules();
    const m = await import('../../src/storage/session');
    await expect(m.saveSession({ doc, sources })).resolves.toBeUndefined();
    await expect(m.saveSessionDoc(doc)).resolves.toBeUndefined();
    await expect(m.loadSession()).resolves.toBeNull();
    await expect(m.clearSession()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
