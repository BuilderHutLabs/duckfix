import type { SourceRef } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { releaseCanvas, renderPage } from '../imaging/render';

export type ThumbState = { status: 'pending' } | { status: 'ready'; url: string } | { status: 'error' };

export interface ThumbnailDeps {
  render: typeof renderPage;
  release: typeof releaseCanvas;
  toBlob(canvas: HTMLCanvasElement): Promise<Blob>;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
}

export interface ThumbnailCache {
  /** Queues a render of the raw page unless it is already cached or queued. */
  request(pageId: string, source: SourceFile, ref: SourceRef): void;
  get(pageId: string): ThumbState | undefined;
  subscribe(pageId: string, cb: () => void): () => void;
  /** Drops (and revokes) every entry whose page id is not in `ids`. */
  retain(ids: Set<string>): void;
  /** Drops everything; the cache stays usable (React StrictMode remounts). */
  clear(): void;
}

const MAX_SIDE = 200;
const CONCURRENCY = 2;

export const browserThumbnailDeps: ThumbnailDeps = {
  render: renderPage,
  release: releaseCanvas,
  toBlob: (c) =>
    new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    ),
  createUrl: (b) => URL.createObjectURL(b),
  revokeUrl: (u) => URL.revokeObjectURL(u),
};

interface Job {
  pageId: string;
  source: SourceFile;
  ref: SourceRef;
}

export function createThumbnailCache(deps: ThumbnailDeps = browserThumbnailDeps): ThumbnailCache {
  const entries = new Map<string, ThumbState>();
  const listeners = new Map<string, Set<() => void>>();
  let queue: Job[] = [];
  let active = 0;
  // Bumped by clear(): renders started before it must not write back.
  let generation = 0;

  const notify = (pageId: string) => listeners.get(pageId)?.forEach((cb) => cb());

  const drop = (pageId: string) => {
    const e = entries.get(pageId);
    if (e?.status === 'ready') deps.revokeUrl(e.url);
    entries.delete(pageId);
    notify(pageId);
  };

  const work = async (job: Job) => {
    const gen = generation;
    const settle = (make: () => ThumbState) => {
      if (gen !== generation || entries.get(job.pageId)?.status !== 'pending') return;
      entries.set(job.pageId, make());
      notify(job.pageId);
    };
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = await deps.render(job.source, job.ref, MAX_SIDE);
      const blob = await deps.toBlob(canvas);
      settle(() => ({ status: 'ready', url: deps.createUrl(blob) }));
    } catch {
      settle(() => ({ status: 'error' }));
    } finally {
      if (canvas) deps.release(canvas);
      active--;
      pump();
    }
  };

  const pump = () => {
    while (active < CONCURRENCY && queue.length) {
      const job = queue.shift()!;
      if (entries.get(job.pageId)?.status !== 'pending') continue;
      active++;
      void work(job);
    }
  };

  return {
    request(pageId, source, ref) {
      if (entries.has(pageId)) return;
      entries.set(pageId, { status: 'pending' });
      queue.push({ pageId, source, ref });
      pump();
    },
    get: (pageId) => entries.get(pageId),
    subscribe(pageId, cb) {
      let set = listeners.get(pageId);
      if (!set) listeners.set(pageId, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
        if (set.size === 0) listeners.delete(pageId);
      };
    },
    retain(ids) {
      for (const id of [...entries.keys()]) if (!ids.has(id)) drop(id);
      queue = queue.filter((j) => ids.has(j.pageId));
    },
    clear() {
      generation++;
      queue = [];
      for (const id of [...entries.keys()]) drop(id);
    },
  };
}
