import { vi } from 'vitest';
import { createAppStore, mergeAnalysis } from '../../src/ui/store';
import type { PageAnalysis } from '../../src/pipeline/analyze';
import type { StoreDeps } from '../../src/ui/store';
import { docWithFlags, fakeDeps, page, source } from './fixtures';

const result = (pageId: string, over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  pageId,
  rotation: 180,
  skewDeg: 1.2,
  flags: ['check-orientation'],
  confidence: 1,
  ms: 1,
  ...over,
});

/** analyzePages fake that hands its onResult/signal to the test. */
function controllableAnalysis() {
  const ctl: {
    onResult?: (a: PageAnalysis) => void;
    signal?: AbortSignal;
    finish?: () => void;
  } = {};
  const analyzePages: StoreDeps['analyzePages'] = vi.fn(
    (_pages, _deps, onResult, opts) =>
      new Promise<void>((resolve) => {
        ctl.onResult = onResult;
        ctl.signal = opts.signal;
        ctl.finish = resolve;
      }),
  );
  return { ctl, analyzePages };
}

const unanalyzed = (id: string) => page(id, { analyzed: false, autoRotation: null });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mergeAnalysis', () => {
  it('applies the result to an untouched page', () => {
    const d = mergeAnalysis({ pages: [unanalyzed('a')] }, result('a'));
    expect(d.pages[0]).toMatchObject({
      rotation: 180,
      autoRotation: 180,
      skewDeg: 1.2,
      flags: ['check-orientation'],
      analyzed: true,
    });
  });

  it('keeps a rotation the user set before the result arrived and drops check-orientation', () => {
    const d = mergeAnalysis(
      { pages: [{ ...unanalyzed('a'), rotation: 90 }] },
      result('a', { flags: ['check-orientation', 'low-text'] }),
    );
    expect(d.pages[0]).toMatchObject({ rotation: 90, autoRotation: 180, skewDeg: 1.2, analyzed: true });
    expect(d.pages[0].flags).toEqual(['low-text']);
  });

  it('returns the same doc when the page is missing or already analyzed', () => {
    const doc = { pages: [page('a')] };
    expect(mergeAnalysis(doc, result('a'))).toBe(doc);
    expect(mergeAnalysis(doc, result('zzz'))).toBe(doc);
  });
});

describe('app store', () => {
  it('open: imports, shows the grid at once and analyzes with the agreed options', async () => {
    const { ctl, analyzePages } = controllableAnalysis();
    const deps = fakeDeps({ analyzePages });
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'skan.pdf')]);
    await flush();
    expect(store.getState().phase).toBe('analyzing');
    expect(store.getState().doc.pages).toHaveLength(1);
    expect(store.getState().progress).toEqual({ done: 0, total: 1 });
    expect(vi.mocked(analyzePages).mock.calls[0][3]).toMatchObject({ concurrency: 2, maxSide: 2000, deskew: true });

    ctl.onResult!(result('n1', { rotation: 90, flags: [] }));
    expect(store.getState().doc.pages[0].rotation).toBe(90);
    expect(store.getState().progress).toEqual({ done: 1, total: 1 });
    expect(store.getState().canUndo).toBe(false); // analysis is not a user action

    ctl.finish!();
    await flush();
    expect(store.getState().phase).toBe('review');
  });

  it('creates the detector once and reuses it across documents', async () => {
    const deps = fakeDeps();
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'a.pdf')]);
    await flush();
    store.goHome();
    await store.open([new File(['x'], 'b.pdf')]);
    await flush();
    expect(deps.createDetector).toHaveBeenCalledTimes(1);
    expect(deps.analyzePages).toHaveBeenCalledTimes(2);
  });

  it('analysis results survive undo of a user action made before they arrived', async () => {
    const { ctl, analyzePages } = controllableAnalysis();
    const store = createAppStore(fakeDeps({ analyzePages }));
    store.load({ pages: [unanalyzed('a'), unanalyzed('b')] }, [source]);
    await flush();
    store.rotate(['a'], 90);
    ctl.onResult!(result('a')); // user-rotated: rotation kept
    ctl.onResult!(result('b', { rotation: 270 }));
    expect(store.getState().doc.pages.map((p) => p.rotation)).toEqual([90, 270]);
    store.undo();
    // before the user's tap, page a takes the detected rotation; b keeps its result
    expect(store.getState().doc.pages.map((p) => [p.rotation, p.analyzed])).toEqual([
      [180, true],
      [270, true],
    ]);
    expect(store.getState().canUndo).toBe(false);
  });

  it('goHome aborts the analysis and ignores late results', async () => {
    const { ctl, analyzePages } = controllableAnalysis();
    const deps = fakeDeps({ analyzePages });
    const store = createAppStore(deps);
    store.load({ pages: [unanalyzed('a')] }, [source]);
    await flush();
    store.goHome();
    expect(ctl.signal!.aborted).toBe(true);
    expect(deps.forgetPdf).toHaveBeenCalledWith('f1');
    ctl.onResult!(result('a'));
    expect(store.getState().phase).toBe('home');
    expect(store.getState().doc.pages).toEqual([]);
  });

  it('detector failure: Polish message, grid stays usable', async () => {
    const store = createAppStore(fakeDeps({ createDetector: vi.fn(async () => Promise.reject(new Error('wasm'))) }));
    store.load({ pages: [unanalyzed('a')] }, [source]);
    await flush();
    await flush();
    expect(store.getState().phase).toBe('review');
    expect(store.getState().error).toBe('Automatyczne obracanie nie zadziałało. Możesz obracać strony ręcznie.');
  });

  it('toggling "show only flagged" clears the selection so hidden pages cannot be removed', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(3, { 0: ['check-orientation'] }), [source]);
    store.toggleSelecting();
    store.toggleSelected('p2');
    store.setFilterFlagged(true);
    expect(store.getState().selection.size).toBe(0);
    store.remove(store.getState().selection);
    expect(store.getState().doc.pages).toHaveLength(3);
  });

  it('move validates indices and moveById maps ids', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(3), [source]);
    store.move(0, 5);
    store.move(-1, 0);
    store.move(1, 1);
    expect(store.getState().canUndo).toBe(false);
    store.moveById('p1', 'p3');
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
    store.moveById('p1', 'nope');
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('insertAt imports, inserts at the index and analyzes the new pages', async () => {
    const deps = fakeDeps();
    const store = createAppStore(deps);
    store.load(docWithFlags(2), [source]);
    await store.insertAt(1, [new File(['x'], 'b.jpg')]);
    await flush();
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p1', 'n1', 'p2']);
    expect(vi.mocked(deps.analyzePages).mock.calls[0][0].map((p) => p.id)).toEqual(['n1']);
    store.undo();
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('export: builds the PDF with page progress, then waits for a fresh tap to share <first source>_wduck.pdf', async () => {
    let report: ((done: number, total: number) => void) | undefined;
    let finish: (b: Uint8Array) => void = () => {};
    const exportPdf: StoreDeps['exportPdf'] = vi.fn((_doc, _sources, onProgress) => {
      report = onProgress;
      return new Promise<Uint8Array>((resolve) => (finish = resolve));
    });
    const deps = fakeDeps({ exportPdf, share: vi.fn(async () => 'shared' as const) });
    const store = createAppStore(deps);
    store.load(docWithFlags(2), [source]);
    const done = store.export();
    expect(store.getState().busy).toBe('exporting');
    expect(deps.exportPdf).toHaveBeenCalledWith(store.getState().doc, new Map([['f1', source]]), expect.any(Function));
    report!(1, 2);
    expect(store.getState().exportProgress).toEqual({ done: 1, total: 2 });
    finish(new Uint8Array([1]));
    await done;

    // the share sheet needs a fresh user activation: nothing is shared until the user taps again
    expect(deps.share).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ busy: null, exportProgress: null });
    const file = store.getState().exportReady!;
    expect(file.name).toBe('skan_wduck.pdf');
    expect(file.type).toBe('application/pdf');

    await store.shareExport();
    expect(deps.share).toHaveBeenCalledWith(file);
    expect(store.getState().exportReady).toBeNull();
  });

  it('a cancelled share keeps the file ready for another tap', async () => {
    const deps = fakeDeps({ share: vi.fn(async () => 'cancelled' as const) });
    const store = createAppStore(deps);
    store.load(docWithFlags(1), [source]);
    await store.export();
    await store.shareExport();
    expect(store.getState().exportReady).not.toBeNull();
  });

  it('an edit after export drops the stale ready file', async () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(2), [source]);
    await store.export();
    expect(store.getState().exportReady).not.toBeNull();
    store.rotate(['p1'], 90);
    expect(store.getState().exportReady).toBeNull();
  });

  it('a failed share shows the export error and keeps the file', async () => {
    const store = createAppStore(fakeDeps({ share: vi.fn(async () => Promise.reject(new Error('x'))) }));
    store.load(docWithFlags(1), [source]);
    await store.export();
    await store.shareExport();
    expect(store.getState().error).toBe('Nie udało się zapisać PDF. Spróbuj ponownie.');
    expect(store.getState().exportReady).not.toBeNull();
  });

  it('export failure shows a Polish message', async () => {
    const store = createAppStore(fakeDeps({ exportPdf: vi.fn(async () => Promise.reject(new Error('x'))) }));
    store.load(docWithFlags(1), [source]);
    await store.export();
    expect(store.getState().error).toBe('Nie udało się zapisać PDF. Spróbuj ponownie.');
  });

  it('deskew setting is read from and saved to storage; broken storage falls back to on', () => {
    const map = new Map<string, string>([['wduck.deskew', '0']]);
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const store = createAppStore(fakeDeps({ storage }));
    expect(store.getState().deskew).toBe(false);
    store.setDeskew(true);
    expect(map.get('wduck.deskew')).toBe('1');

    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s2 = createAppStore(fakeDeps({ storage: throwing }));
    expect(s2.getState().deskew).toBe(true);
    s2.setDeskew(false);
    expect(s2.getState().deskew).toBe(false);
  });
});
