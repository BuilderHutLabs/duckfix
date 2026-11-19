import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// Thumbnails never finish rendering in jsdom: keep them pending (no canvas, no object URLs).
vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import type { SessionStorage, StoredSession } from '../../src/storage/session';
import type { PageAnalysis } from '../../src/pipeline/analyze';
import type { StoreDeps } from '../../src/ui/store';
import { fakeDeps, page, source } from './fixtures';

/** In-memory SessionStorage; `stored` is what IndexedDB would hold. */
function memorySession(initial: StoredSession | null = null) {
  const box = { stored: initial };
  const session: SessionStorage = {
    save: vi.fn(async (s) => {
      box.stored = { doc: s.doc, sources: [...s.sources] };
    }),
    saveDoc: vi.fn(async (doc) => {
      if (box.stored) box.stored = { ...box.stored, doc };
    }),
    load: vi.fn(async () => box.stored),
    clear: vi.fn(async () => {
      box.stored = null;
    }),
  };
  return { box, session };
}

const result = (pageId: string, over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  pageId,
  rotation: 90,
  skewDeg: 0,
  flags: [],
  confidence: 3,
  ms: 120,
  ...over,
});

/** analyzePages fake that hands its onResult to the test and never finishes on its own. */
function controllableAnalysis() {
  const ctl: { onResult?: (a: PageAnalysis) => void; finish?: () => void } = {};
  const analyzePages: StoreDeps['analyzePages'] = vi.fn(
    (_pages, _deps, onResult) =>
      new Promise<void>((resolve) => {
        ctl.onResult = onResult;
        ctl.finish = resolve;
      }),
  );
  return { ctl, analyzePages };
}

const stored: StoredSession = {
  doc: { pages: [page('a'), page('b', { analyzed: false, autoRotation: null }), page('c', { analyzed: false, autoRotation: null })] },
  sources: [source],
};

afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

describe('persistent session', () => {
  it('Home offers to restore; restore lands on review and analyzes only unanalyzed pages', async () => {
    const { session } = memorySession(stored);
    const deps = fakeDeps({ session });
    render(<App store={createAppStore(deps)} />);

    const back = await screen.findByRole('button', { name: strings.restoreSession });
    expect(screen.getByRole('button', { name: strings.startOver })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings.open })).toBeNull();

    fireEvent.click(back);
    await waitFor(() => expect(deps.analyzePages).toHaveBeenCalledTimes(1));
    expect(vi.mocked(deps.analyzePages).mock.calls[0][0].map((p) => p.id)).toEqual(['b', 'c']);
    expect(screen.getAllByRole('button', { name: /^Strona \d+/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: strings.save })).toBeTruthy(); // review toolbar
  });

  it('"Zacznij od nowa" clears the stored session and shows the open button', async () => {
    const { box, session } = memorySession(stored);
    render(<App store={createAppStore(fakeDeps({ session }))} />);
    fireEvent.click(await screen.findByRole('button', { name: strings.startOver }));
    expect(screen.getByRole('button', { name: strings.open })).toBeTruthy();
    expect(session.clear).toHaveBeenCalled();
    await waitFor(() => expect(box.stored).toBeNull());
  });

  it('a failed import keeps the stored session restorable', async () => {
    const { box, session } = memorySession(stored);
    const deps = fakeDeps({ session });
    vi.mocked(deps.importFiles).mockRejectedValueOnce(new Error('encrypted'));
    const store = createAppStore(deps);
    await act(async () => {}); // let the startup load resolve
    await store.open([new File(['x'], 'zly.pdf')]);
    expect(store.getState().error).toBeTruthy();
    expect(session.clear).not.toHaveBeenCalled();
    expect(box.stored).toEqual(stored);
    expect(store.getState().restorable).toBe(true);
    store.restore();
    expect(store.getState().phase).toBe('analyzing');
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('opening a file stores the new doc and sources over the old session', async () => {
    const { box, session } = memorySession(stored);
    const store = createAppStore(fakeDeps({ session }));
    await act(async () => {}); // let the startup load resolve
    await store.open([new File(['x'], 'nowy.pdf')]);
    expect(session.clear).not.toHaveBeenCalled();
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(box.stored!.doc.pages.map((p) => p.id)).toEqual(['n1']);
    expect(box.stored!.sources).toEqual([source]);
    expect(store.getState().restorable).toBe(false);
  });

  it('saves the doc 500 ms after changes (incl. analysis results); closing clears it', async () => {
    vi.useFakeTimers();
    const { ctl, analyzePages } = controllableAnalysis();
    const { box, session } = memorySession();
    const store = createAppStore(fakeDeps({ session, analyzePages }));
    await store.open([new File(['x'], 'skan.pdf')]);
    await vi.advanceTimersByTimeAsync(0);

    ctl.onResult!(result('n1'));
    store.rotate(['n1'], 90);
    expect(session.saveDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(session.saveDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(session.saveDoc).toHaveBeenCalledTimes(1);
    expect(box.stored!.doc.pages[0]).toMatchObject({ analyzed: true, autoRotation: 90, rotation: 180 });

    store.rotate(['n1'], 90);
    store.goHome();
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.saveDoc).toHaveBeenCalledTimes(1); // pending save cancelled
    expect(box.stored).toBeNull();
  });

  it('keeps saving at least every 2.5 s while changes keep coming', async () => {
    vi.useFakeTimers();
    const { ctl, analyzePages } = controllableAnalysis();
    const { session } = memorySession();
    const deps = fakeDeps({ session, analyzePages });
    const many = Array.from({ length: 12 }, (_, i) => page(`q${i}`, { analyzed: false, autoRotation: null }));
    vi.mocked(deps.importFiles).mockResolvedValueOnce({ sources: [source], pages: many });
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'skan.pdf')]);
    await vi.advanceTimersByTimeAsync(0);

    // a result every 400 ms re-arms the 500 ms debounce each time
    for (let i = 0; i < 6; i++) {
      ctl.onResult!(result(`q${i}`));
      await vi.advanceTimersByTimeAsync(400);
    }
    // 2400 ms since the first unsaved change: not yet
    expect(session.saveDoc).not.toHaveBeenCalled();
    ctl.onResult!(result('q6'));
    await vi.advanceTimersByTimeAsync(100);
    expect(session.saveDoc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(session.saveDoc).mock.calls[0][0].pages.filter((p) => p.analyzed)).toHaveLength(7);

    // the window restarts after a save
    for (let i = 7; i < 12; i++) {
      ctl.onResult!(result(`q${i}`));
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(session.saveDoc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(session.saveDoc).toHaveBeenCalledTimes(2);
  });

  it('insertAt stores the new source set', async () => {
    const { box, session } = memorySession();
    const deps = fakeDeps({ session });
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'skan.pdf')]);
    const extra = { ...source, id: 'f2', name: 'b.pdf' };
    vi.mocked(deps.importFiles).mockResolvedValueOnce({ sources: [extra], pages: [page('m1', { analyzed: false })] });
    await store.insertAt(1, [new File(['y'], 'b.pdf')]);
    expect(box.stored!.sources.map((s) => s.id)).toEqual(['f1', 'f2']);
    expect(box.stored!.doc.pages.map((p) => p.id)).toEqual(['n1', 'm1']);
  });
});

describe('diagnostics', () => {
  it('#diag opens the diagnostics screen with the report', async () => {
    window.location.hash = '#diag';
    const store = createAppStore(fakeDeps());
    store.load(stored.doc, [source]);
    render(<App store={store} />);
    const pre = await screen.findByTestId('diag-report');
    await waitFor(() => expect(pre.textContent).toContain('Urządzenie: '));
    expect(pre.textContent).toContain('ANALYSIS_MAX_SIDE: 2000');
    expect(pre.textContent).toContain('minConfidence=2');
    expect(pre.textContent).toContain('Liczba stron: 0');
    expect(screen.getByRole('button', { name: strings.copy })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    expect(screen.queryByTestId('diag-report')).toBeNull();
  });

  it('5 taps within 3 s on the Home title open diagnostics', async () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const title = screen.getByRole('heading', { name: strings.appName });
    for (let i = 0; i < 4; i++) fireEvent.click(title);
    expect(screen.queryByTestId('diag-report')).toBeNull();
    fireEvent.click(title);
    expect(await screen.findByTestId('diag-report')).toBeTruthy();
  });

  it('taps spread over more than 3 s do not open diagnostics', () => {
    const now = vi.spyOn(Date, 'now');
    render(<App store={createAppStore(fakeDeps())} />);
    const title = screen.getByRole('heading', { name: strings.appName });
    for (let i = 0; i < 5; i++) {
      now.mockReturnValue(1000 + i * 800);
      fireEvent.click(title);
    }
    expect(screen.queryByTestId('diag-report')).toBeNull();
    now.mockRestore();
  });

  it('the report includes the analysis results of the open document', async () => {
    const { ctl, analyzePages } = controllableAnalysis();
    const store = createAppStore(fakeDeps({ analyzePages }));
    await store.open([new File(['x'], 'skan.pdf')]);
    await act(async () => {});
    ctl.onResult!(result('n1', { rotation: 180 }));
    window.location.hash = '#diag';
    render(<App store={store} />);
    const pre = await screen.findByTestId('diag-report');
    await waitFor(() => expect(pre.textContent).toContain('Liczba stron: 1'));
    expect(pre.textContent).toContain('180°=1');
  });

  it('copy writes the report to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    window.location.hash = '#diag';
    render(<App store={createAppStore(fakeDeps())} />);
    const pre = await screen.findByTestId('diag-report');
    await waitFor(() => expect(pre.textContent).toContain('Urządzenie'));
    fireEvent.click(screen.getByRole('button', { name: strings.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(pre.textContent));
  });
});
