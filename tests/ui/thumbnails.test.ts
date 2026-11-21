import { vi } from 'vitest';
import { createThumbnailCache, type ThumbnailDeps } from '../../src/ui/thumbnails';
import type { SourceRef } from '../../src/model/document';
import { source } from './fixtures';

const ref: SourceRef = { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 0, hasTextLayer: false };
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(fail: Set<string> = new Set()) {
  let active = 0;
  let peak = 0;
  const pending: Array<() => void> = [];
  let n = 0;
  const deps: ThumbnailDeps = {
    render: vi.fn(async (_s, r: SourceRef) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => pending.push(resolve));
      active--;
      if (r.kind === 'pdf' && fail.has(String(r.pageIndex))) throw new Error('bad page');
      return { kind: 'canvas' } as unknown as HTMLCanvasElement;
    }),
    release: vi.fn(),
    toBlob: vi.fn(async () => new Blob(['png'])),
    createUrl: vi.fn(() => `blob:${++n}`),
    revokeUrl: vi.fn(),
    applyFilter: vi.fn(),
  };
  const releaseAll = async () => {
    while (pending.length) {
      pending.splice(0).forEach((r) => r());
      await flush();
    }
  };
  return { deps, releaseAll, peak: () => peak };
}

describe('thumbnail cache', () => {
  it('renders lazily with at most 2 in flight, at 200 px, and releases canvases', async () => {
    const t = setup();
    const cache = createThumbnailCache(t.deps);
    for (let i = 0; i < 5; i++) cache.request(`p${i}`, source, { ...ref, pageIndex: i });
    cache.request('p0', source, ref); // duplicate request is ignored
    await flush();
    expect(t.deps.render).toHaveBeenCalledTimes(2);
    await t.releaseAll();
    expect(t.peak()).toBe(2);
    expect(t.deps.render).toHaveBeenCalledTimes(5);
    expect(vi.mocked(t.deps.render).mock.calls[0][2]).toBe(200);
    expect(t.deps.release).toHaveBeenCalledTimes(5);
    expect(cache.get('p3')).toEqual({ status: 'ready', url: 'blob:4' });
  });

  it('a failing page gets an error state and notifies subscribers', async () => {
    const t = setup(new Set(['1']));
    const cache = createThumbnailCache(t.deps);
    const cb = vi.fn();
    cache.subscribe('p1', cb);
    cache.request('p0', source, ref);
    cache.request('p1', source, { ...ref, pageIndex: 1 });
    await flush();
    await t.releaseAll();
    expect(cache.get('p1')).toEqual({ status: 'error' });
    expect(cache.get('p0')?.status).toBe('ready');
    expect(cb).toHaveBeenCalled();
  });

  it('retain revokes URLs of removed pages; clear revokes all', async () => {
    const t = setup();
    const cache = createThumbnailCache(t.deps);
    cache.request('a', source, ref);
    cache.request('b', source, ref);
    await flush();
    await t.releaseAll();
    cache.retain(new Set(['b']));
    expect(t.deps.revokeUrl).toHaveBeenCalledWith('blob:1');
    expect(cache.get('a')).toBeUndefined();
    cache.clear();
    expect(t.deps.revokeUrl).toHaveBeenCalledWith('blob:2');
    expect(cache.get('b')).toBeUndefined();
  });

  it('a render finishing after clear() creates no URL', async () => {
    const t = setup();
    const cache = createThumbnailCache(t.deps);
    cache.request('a', source, ref);
    await flush();
    cache.clear();
    await t.releaseAll();
    expect(t.deps.createUrl).not.toHaveBeenCalled();
    expect(t.deps.release).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBeUndefined();
  });

  it('a page whose look changed (Wybielony) is drawn again with the filter', async () => {
    const t = setup();
    const cache = createThumbnailCache(t.deps);
    cache.request('p0', source, ref);
    await t.releaseAll();
    expect(t.deps.applyFilter).not.toHaveBeenCalled();
    cache.request('p0', source, ref, 'whiten');
    await t.releaseAll();
    expect(t.deps.render).toHaveBeenCalledTimes(2);
    expect(vi.mocked(t.deps.applyFilter).mock.calls[0][1]).toBe('whiten');
    expect(t.deps.revokeUrl).toHaveBeenCalledWith('blob:1');
    cache.request('p0', source, ref, 'whiten'); // same look: kept
    await t.releaseAll();
    expect(t.deps.render).toHaveBeenCalledTimes(2);
  });
});
