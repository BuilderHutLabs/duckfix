import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { StoredSession } from '../../src/storage/session';
import type { PageAnalysis } from '../../src/pipeline/analyze';
import type { StoreDeps } from '../../src/ui/store';
import type { Page } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';
import { docMeta, fakeDeps, memoryLibrary, page, source } from './fixtures';

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

const kept = (id: string, name: string, at: number, s: StoredSession = stored) => ({ meta: docMeta(id, name, at, { pages: s.doc.pages.length }), s });
const other: StoredSession = { doc: { pages: [page('x1')] }, sources: [{ ...source, id: 'f9', name: 'umowa.pdf' }] };

describe('Moje dokumenty', () => {
  it('Home shows "Moje (N)" and "Wróć do ostatniego dokumentu"; Wróć opens the newest where it was left', async () => {
    const { library } = memoryLibrary([kept('a', 'Faktura VAT', 200), kept('b', 'Umowa', 100, other)]);
    const deps = fakeDeps({ library });
    render(<App store={createAppStore(deps)} />);
    expect(await screen.findByRole('button', { name: strings.docsShort(2) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings.startOver })).toBeNull();
    const back = screen.getByRole('button', { name: strings.restoreSession });
    expect(back.textContent).toContain('Faktura VAT'); // the newest one
    fireEvent.click(back);
    await waitFor(() => expect(deps.analyzePages).toHaveBeenCalledTimes(1));
    expect(vi.mocked(deps.analyzePages).mock.calls[0][0].map((p) => p.id)).toEqual(['b', 'c']);
    expect(screen.getAllByRole('button', { name: /^Strona \d+/ })).toHaveLength(3);
  });

  it('nothing kept: no "Moje" button and no "Wróć"', async () => {
    const { library } = memoryLibrary();
    render(<App store={createAppStore(fakeDeps({ library }))} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /Moje \(/ })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.restoreSession })).toBeNull();
  });

  it('"Moje (2)" lists the documents newest first with pages; a tap opens one', async () => {
    const { library } = memoryLibrary([kept('b', 'Umowa', 100, other), kept('a', 'Faktura VAT', 200)]);
    render(<App store={createAppStore(fakeDeps({ library }))} />);
    fireEvent.click(await screen.findByRole('button', { name: strings.docsShort(2) }));
    const list = screen.getByRole('dialog', { name: strings.docsTitle });
    const rows = within(list).getAllByRole('button', { name: /Faktura VAT|Umowa/ }).filter((b) => b.classList.contains('doc-open'));
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Faktura VAT'), expect.stringContaining('Umowa')]);
    expect(rows[0].textContent).toContain(strings.docPages(3));
    fireEvent.click(rows[1]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Strona \d+/ })).toHaveLength(1));
    expect(screen.queryByRole('dialog', { name: strings.docsTitle })).toBeNull();
  });

  it('rename from the ⋯ menu: the new name is kept and is the name of the saved file', async () => {
    const { library, docs } = memoryLibrary([kept('a', 'skan', 200)]);
    const store = createAppStore(fakeDeps({ library }));
    render(<App store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: strings.docsShort(1) }));
    fireEvent.click(screen.getByRole('button', { name: strings.docMore('skan') }));
    vi.spyOn(window, 'prompt').mockReturnValue('Faktura VAT 12-2026');
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: strings.docRename })));
    expect(within(screen.getByRole('dialog', { name: strings.docsTitle })).getByText('Faktura VAT 12-2026')).toBeTruthy();
    expect(docs.get('a')!.meta.name).toBe('Faktura VAT 12-2026');
    await act(async () => store.openStored('a'));
    expect(store.defaultFileName()).toBe(`Faktura VAT 12-2026${strings.exportSuffix}`);
  });

  it('remove from the ⋯ menu asks first; "Anuluj" keeps it', async () => {
    const { library, docs } = memoryLibrary([kept('a', 'Faktura', 200), kept('b', 'Umowa', 100, other)]);
    render(<App store={createAppStore(fakeDeps({ library }))} />);
    fireEvent.click(await screen.findByRole('button', { name: strings.docsShort(2) }));
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: strings.docMore('Umowa') }));
    fireEvent.click(screen.getByRole('menuitem', { name: strings.docRemove }));
    expect(ask).toHaveBeenCalledWith(strings.docRemoveConfirm('Umowa'));
    expect(docs.has('b')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: strings.docMore('Umowa') }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: strings.docRemove })));
    expect(docs.has('b')).toBe(false);
    expect(screen.queryByText('Umowa')).toBeNull();
    expect(screen.getByRole('button', { name: strings.docsShort(1) })).toBeTruthy();
  });

  it('opening a file adds a NEW document named after the file; the earlier one stays', async () => {
    const { library, docs } = memoryLibrary([kept('a', 'Faktura', 200)]);
    const store = createAppStore(fakeDeps({ library }));
    await act(async () => {});
    await store.open([new File(['x'], 'skan.pdf')]);
    await act(async () => {});
    expect(docs.size).toBe(2);
    const added = [...docs.values()].find((d) => d.meta.id !== 'a')!;
    expect(added.meta).toMatchObject({ name: 'skan', pages: 1 });
    expect(added.s.doc.pages.map((p) => p.id)).toEqual(['n1']);
    expect(docs.get('a')!.s).toEqual(stored);
  });

  it('a failed import changes nothing in the list', async () => {
    const { library, docs } = memoryLibrary([kept('a', 'Faktura', 200)]);
    const deps = fakeDeps({ library });
    vi.mocked(deps.importFiles).mockRejectedValueOnce(new Error('encrypted'));
    const store = createAppStore(deps);
    await act(async () => {});
    await store.open([new File(['x'], 'zly.pdf')]);
    expect(store.getState().error).toBeTruthy();
    expect(docs.size).toBe(1);
    expect(store.getState().restorable).toBe(true);
  });

  it('saves the doc 500 ms after changes (incl. analysis results); closing keeps it with the last change, without asking', async () => {
    vi.useFakeTimers();
    const { ctl, analyzePages } = controllableAnalysis();
    const { library, docs } = memoryLibrary();
    const store = createAppStore(fakeDeps({ library, analyzePages }));
    await store.open([new File(['x'], 'skan.pdf')]);
    await vi.advanceTimersByTimeAsync(0);
    const id = [...docs.keys()][0];

    ctl.onResult!(result('n1'));
    store.rotate(['n1'], 90);
    expect(library.saveDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(library.saveDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(library.saveDoc).toHaveBeenCalledTimes(1);
    expect(docs.get(id)!.s.doc.pages[0]).toMatchObject({ analyzed: true, autoRotation: 90, rotation: 180 });

    store.rotate(['n1'], 90);
    store.goHome(); // the pending change is written at once
    await vi.advanceTimersByTimeAsync(1000);
    expect(library.saveDoc).toHaveBeenCalledTimes(2);
    expect(docs.get(id)!.s.doc.pages[0].rotation).toBe(270);
    expect(store.getState().library.map((m) => m.id)).toEqual([id]);
  });

  it('the ✕ of the document closes it without asking (it is kept)', async () => {
    const { library } = memoryLibrary();
    const store = createAppStore(fakeDeps({ library }));
    await store.open([new File(['x'], 'skan.pdf')]);
    render(<App store={store} />);
    const ask = vi.spyOn(window, 'confirm');
    fireEvent.click(screen.getAllByRole('button', { name: strings.close })[0]);
    expect(ask).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: strings.docsShort(1) })).toBeTruthy();
  });

  it('keeps saving at least every 2.5 s while changes keep coming', async () => {
    vi.useFakeTimers();
    const { ctl, analyzePages } = controllableAnalysis();
    const { library } = memoryLibrary();
    const deps = fakeDeps({ library, analyzePages });
    const many = Array.from({ length: 12 }, (_, i) => page(`q${i}`, { analyzed: false, autoRotation: null }));
    vi.mocked(deps.importFiles).mockResolvedValueOnce({ sources: [source], pages: many });
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'skan.pdf')]);
    await vi.advanceTimersByTimeAsync(0);

    for (let i = 0; i < 6; i++) {
      ctl.onResult!(result(`q${i}`));
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(library.saveDoc).not.toHaveBeenCalled();
    ctl.onResult!(result('q6'));
    await vi.advanceTimersByTimeAsync(100);
    expect(library.saveDoc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(library.saveDoc).mock.calls[0][1].pages.filter((p) => p.analyzed)).toHaveLength(7);

    for (let i = 7; i < 12; i++) {
      ctl.onResult!(result(`q${i}`));
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(library.saveDoc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(library.saveDoc).toHaveBeenCalledTimes(2);
  });

  it('insertAt stores the new source set', async () => {
    const { library, docs } = memoryLibrary();
    const deps = fakeDeps({ library });
    const store = createAppStore(deps);
    await store.open([new File(['x'], 'skan.pdf')]);
    const extra = { ...source, id: 'f2', name: 'b.pdf' };
    vi.mocked(deps.importFiles).mockResolvedValueOnce({ sources: [extra], pages: [page('m1', { analyzed: false })] });
    await store.insertAt(1, [new File(['y'], 'b.pdf')]);
    await act(async () => {});
    const d = [...docs.values()][0];
    expect(docs.size).toBe(1);
    expect(d.s.sources.map((s) => s.id)).toEqual(['f1', 'f2']);
    expect(d.s.doc.pages.map((p) => p.id)).toEqual(['n1', 'm1']);
  });

  it('a document kept without a small picture (earlier version) gets one when the list opens', async () => {
    const { library, docs } = memoryLibrary([kept('a', 'Stary', 200)]);
    const docThumb = vi.fn(async (_p: Page, _s: SourceFile) => 'data:image/jpeg;base64,old');
    render(<App store={createAppStore(fakeDeps({ library, docThumb }))} />);
    fireEvent.click(await screen.findByRole('button', { name: strings.docsShort(1) }));
    await waitFor(() => expect(docs.get('a')!.meta.thumb).toBe('data:image/jpeg;base64,old'));
    const list = screen.getByRole('dialog', { name: strings.docsTitle });
    await waitFor(() => expect(list.querySelector('.doc-thumb img')?.getAttribute('src')).toBe('data:image/jpeg;base64,old'));
  });

  it('the small picture of the first page is made for the list', async () => {
    const { library, docs } = memoryLibrary();
    const docThumb = vi.fn(async (_p: Page, _s: SourceFile) => 'data:image/jpeg;base64,abc');
    const store = createAppStore(fakeDeps({ library, docThumb }));
    await store.open([new File(['x'], 'skan.pdf')]);
    await waitFor(() => expect([...docs.values()][0].meta.thumb).toBe('data:image/jpeg;base64,abc'));
    expect(docThumb.mock.calls[0][0].id).toBe('n1');
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

describe('shortcuts on the app icon', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('"Ostatni dokument" (?go=last) opens the stored document by itself and tidies the address', async () => {
    const { library } = memoryLibrary([kept('a', 'Faktura', 200)]);
    window.history.replaceState(null, '', '/?go=last');
    render(<App store={createAppStore(fakeDeps({ library }))} />);
    expect(await screen.findByRole('button', { name: strings.save })).toBeTruthy(); // review screen
    expect(window.location.search).toBe('');
  });

  it('"Ostatni dokument" with nothing stored just shows Home', async () => {
    window.history.replaceState(null, '', '/?go=last');
    render(<App store={createAppStore(fakeDeps())} />);
    expect(await screen.findByRole('button', { name: strings.homeScan })).toBeTruthy();
    expect(window.location.search).toBe('');
  });
});
