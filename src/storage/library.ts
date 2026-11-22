import { createStore, del, get, set, setMany, type UseStore } from 'idb-keyval';
import { IDB_NAME } from '../config';
import type { Doc } from '../model/document';
import { clearSession, loadSession, type StoredSession } from './session';

/**
 * "Moje dokumenty": every document opened or scanned, kept in IndexedDB on this phone until the
 * user deletes it. A small index (names, dates, small pictures) is read for the list; a document's
 * pages and files are read only when it is opened. Every call swallows storage errors (private
 * mode, quota, blocked IndexedDB): persistence is best-effort and must never break the app.
 */
export interface DocMeta {
  id: string;
  name: string;
  /** Last change, ms since 1970. */
  updatedAt: number;
  pages: number;
  /** Bytes of the files the document is made of. */
  size: number;
  /** Small picture of the first page (data URL), when made. */
  thumb: string | null;
}

const INDEX = 'index';
const docKey = (id: string) => `doc:${id}`;

let store: UseStore | null = null;
/** Created lazily: createStore opens the database at once and may throw synchronously. */
const db = (): UseStore => (store ??= createStore(`${IDB_NAME}-docs`, 'docs'));

/** One change at a time, so two writes of the index never overwrite each other. */
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn).catch((e) => {
    console.warn(`wduck: library ${what} failed`, e);
    return fallback;
  });
  chain = run;
  return run;
}

const validMeta = (m: Partial<DocMeta> | null): m is DocMeta =>
  !!m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.updatedAt === 'number';

async function readIndex(): Promise<DocMeta[] | undefined> {
  const raw = await get<unknown>(INDEX, db());
  return Array.isArray(raw) ? (raw as Array<Partial<DocMeta>>).filter(validMeta) : undefined;
}

const isSession = (v: unknown): v is StoredSession =>
  typeof v === 'object' && v !== null && Array.isArray((v as StoredSession).doc?.pages) && Array.isArray((v as StoredSession).sources);

/** File name without its extension: the name a new document gets. */
export function docNameFrom(fileName: string): string {
  return fileName.replace(/\.[^./\\]*$/, '').trim() || fileName;
}

export const sizeOf = (s: StoredSession): number => s.sources.reduce((n, f) => n + (f.blob?.size ?? 0), 0);

/** The index; the single "last document" of earlier versions, if still there, moves into it. */
async function index(): Promise<DocMeta[]> {
  const list = (await readIndex()) ?? [];
  const old = await loadSession();
  if (!old) return list;
  const meta: DocMeta = {
    id: crypto.randomUUID(),
    name: docNameFrom(old.sources[0]?.name ?? 'Dokument'),
    updatedAt: Date.now(),
    pages: old.doc.pages.length,
    size: sizeOf(old),
    thumb: null,
  };
  await setMany(
    [
      [docKey(meta.id), old],
      [INDEX, [...list, meta]],
    ],
    db(),
  );
  await clearSession();
  return [meta];
}

const newestFirst = (list: DocMeta[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

/** The store's view of the library (a fake replaces it in tests). */
export interface DocLibrary {
  /** All documents, newest first. */
  list(): Promise<DocMeta[]>;
  /** Stores a document with its files (new, or its file set changed). */
  save(meta: DocMeta, s: StoredSession): Promise<void>;
  /** Replaces only the pages of a stored document. */
  saveDoc(id: string, doc: Doc, patch: Partial<DocMeta>): Promise<void>;
  /** Changes only the list entry: a new name, a small picture. */
  patch(id: string, patch: Partial<DocMeta>): Promise<void>;
  load(id: string): Promise<StoredSession | null>;
  remove(id: string): Promise<void>;
}

export const indexedDbLibrary: DocLibrary = {
  list: () => queued('list', [], async () => newestFirst(await index())),

  save: (meta, s) =>
    queued('save', undefined, async () => {
      const list = (await index()).filter((m) => m.id !== meta.id);
      await setMany(
        [
          [docKey(meta.id), { doc: s.doc, sources: s.sources }],
          [INDEX, [...list, meta]],
        ],
        db(),
      );
    }),

  saveDoc: (id, doc, patch) =>
    queued('save', undefined, async () => {
      const s = await get<unknown>(docKey(id), db());
      if (!isSession(s)) return;
      const list = (await index()).map((m) => (m.id === id ? { ...m, ...patch, id } : m));
      await setMany(
        [
          [docKey(id), { ...s, doc }],
          [INDEX, list],
        ],
        db(),
      );
    }),

  patch: (id, patch) =>
    queued('patch', undefined, async () => {
      const list = (await index()).map((m) => (m.id === id ? { ...m, ...patch, id } : m));
      await set(INDEX, list, db());
    }),

  load: (id) =>
    queued('load', null, async () => {
      const s = await get<unknown>(docKey(id), db());
      return isSession(s) && s.sources.length ? { doc: s.doc, sources: s.sources } : null;
    }),

  remove: (id) =>
    queued('remove', undefined, async () => {
      const list = (await index()).filter((m) => m.id !== id);
      await set(INDEX, list, db());
      await del(docKey(id), db());
    }),
};
