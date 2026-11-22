// @vitest-environment node
// Node's Blob is structured-cloneable (jsdom's is not), matching what Safari stores in IndexedDB.
import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { indexedDbLibrary as lib, type DocMeta } from '../../src/storage/library';
import { clearSession, loadSession, saveSession } from '../../src/storage/session';
import type { Doc } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';

const doc = (...ids: string[]): Doc => ({
  pages: ids.map((id) => ({
    id,
    source: { kind: 'image' as const, fileId: 'f1' },
    rotation: 0 as const,
    skewDeg: 0,
    flags: [],
    autoRotation: null,
    analyzed: false,
  })),
});
const sources: SourceFile[] = [
  { id: 'f1', name: 'Umowa.pdf', type: 'pdf', blob: new Blob([new Uint8Array(500)], { type: 'application/pdf' }) },
];
const meta = (id: string, updatedAt: number, over: Partial<DocMeta> = {}): DocMeta => ({
  id,
  name: `Dokument ${id}`,
  updatedAt,
  pages: 1,
  size: 500,
  thumb: null,
  ...over,
});

afterEach(async () => {
  for (const m of await lib.list()) await lib.remove(m.id);
  await clearSession();
  vi.restoreAllMocks();
});

describe('document library', () => {
  it('keeps several documents; the list is newest first and loading gives back each one', async () => {
    await lib.save(meta('a', 100), { doc: doc('p1'), sources });
    await lib.save(meta('b', 300), { doc: doc('q1', 'q2'), sources });
    await lib.save(meta('c', 200), { doc: doc('r1'), sources });
    expect((await lib.list()).map((m) => m.id)).toEqual(['b', 'c', 'a']);
    const b = await lib.load('b');
    expect(b!.doc.pages.map((p) => p.id)).toEqual(['q1', 'q2']);
    expect(b!.sources[0].blob.size).toBe(500);
  });

  it('saving the same document again replaces it (one entry)', async () => {
    await lib.save(meta('a', 100), { doc: doc('p1'), sources });
    await lib.save(meta('a', 150, { pages: 2 }), { doc: doc('p1', 'p2'), sources });
    const list = await lib.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ updatedAt: 150, pages: 2 });
  });

  it('saveDoc replaces only the pages and updates the date and page count', async () => {
    await lib.save(meta('a', 100), { doc: doc('p1'), sources });
    await lib.saveDoc('a', doc('p1', 'p2', 'p3'), { updatedAt: 500, pages: 3 });
    expect((await lib.load('a'))!.doc.pages).toHaveLength(3);
    expect((await lib.load('a'))!.sources).toHaveLength(1);
    expect((await lib.list())[0]).toMatchObject({ updatedAt: 500, pages: 3, name: 'Dokument a' });
  });

  it('patch renames (or sets the small picture) without touching the pages', async () => {
    await lib.save(meta('a', 100), { doc: doc('p1'), sources });
    await lib.patch('a', { name: 'Faktura VAT', thumb: 'data:image/jpeg;base64,xx' });
    expect((await lib.list())[0]).toMatchObject({ name: 'Faktura VAT', thumb: 'data:image/jpeg;base64,xx', updatedAt: 100 });
    expect((await lib.load('a'))!.doc.pages).toHaveLength(1);
  });

  it('remove deletes the document for good', async () => {
    await lib.save(meta('a', 100), { doc: doc('p1'), sources });
    await lib.save(meta('b', 200), { doc: doc('q1'), sources });
    await lib.remove('a');
    expect((await lib.list()).map((m) => m.id)).toEqual(['b']);
    expect(await lib.load('a')).toBeNull();
  });

  it('the single "last document" of earlier versions moves into the list (nothing is lost)', async () => {
    await saveSession({ doc: doc('old1', 'old2'), sources });
    const list = await lib.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Umowa', pages: 2, size: 500 });
    expect((await lib.load(list[0].id))!.doc.pages.map((p) => p.id)).toEqual(['old1', 'old2']);
    expect(await loadSession()).toBeNull(); // moved, not copied
    expect(await lib.list()).toHaveLength(1);
  });

  it('never throws when IndexedDB fails (private mode)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.resetModules();
    const fresh = (await import('../../src/storage/library')).indexedDbLibrary;
    await expect(fresh.save(meta('a', 1), { doc: doc('p1'), sources })).resolves.toBeUndefined();
    await expect(fresh.list()).resolves.toEqual([]);
    await expect(fresh.load('a')).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
