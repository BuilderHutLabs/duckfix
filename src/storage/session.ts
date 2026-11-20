import { createStore, delMany, getMany, set, setMany, type UseStore } from 'idb-keyval';
import { IDB_NAME } from '../config';
import type { Doc } from '../model/document';
import type { SourceFile } from '../import/importFiles';

/**
 * The last open document, kept in IndexedDB so it survives a closed tab or iOS killing the page.
 * Only the present doc is stored (no undo history). Every call swallows storage errors (private
 * mode, quota, blocked IndexedDB): persistence is best-effort and must never break the app.
 */
export interface StoredSession {
  doc: Doc;
  sources: SourceFile[];
}

const DOC = 'doc';
const SOURCES = 'sources';

let store: UseStore | null = null;
/** Created lazily: createStore opens the database at once and may throw synchronously. */
const db = (): UseStore => (store ??= createStore(IDB_NAME, 'session'));

async function safely<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`wduck: session ${what} failed`, e);
    return fallback;
  }
}

export function saveSession(s: StoredSession): Promise<void> {
  return safely('save', undefined, () =>
    setMany(
      [
        [DOC, s.doc],
        [SOURCES, s.sources],
      ],
      db(),
    ),
  );
}

/** Replaces only the doc (the sources change only when files are opened or inserted). */
export function saveSessionDoc(doc: Doc): Promise<void> {
  return safely('save', undefined, () => set(DOC, doc, db()));
}

export function loadSession(): Promise<StoredSession | null> {
  return safely('load', null, async () => {
    const [doc, sources] = await getMany<unknown>([DOC, SOURCES], db());
    if (!isDoc(doc) || !Array.isArray(sources) || sources.length === 0) return null;
    return { doc, sources: sources as SourceFile[] };
  });
}

export function clearSession(): Promise<void> {
  return safely('clear', undefined, () => delMany([DOC, SOURCES], db()));
}

function isDoc(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && Array.isArray((v as Doc).pages);
}

/** The store's view of session storage (a fake replaces it in tests). */
export interface SessionStorage {
  save(s: StoredSession): Promise<void>;
  saveDoc(doc: Doc): Promise<void>;
  load(): Promise<StoredSession | null>;
  clear(): Promise<void>;
}

export const indexedDbSession: SessionStorage = {
  save: saveSession,
  saveDoc: saveSessionDoc,
  load: loadSession,
  clear: clearSession,
};
