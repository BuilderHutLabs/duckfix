import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { formatSize } from '../../src/i18n';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('duckfix-save-more', '1'); // "Więcej opcji" open for the tests of what is inside
});

function setup(over = {}) {
  const deps = fakeDeps({ shareFirst: false, storage: memoryStorage(), ...over });
  const store = createAppStore(deps);
  store.load(docWithFlags(2), [source]);
  render(<App store={store} />);
  return { deps, store };
}

const saveButton = () => screen.getByRole('button', { name: strings.save });

describe('save sheet', () => {
  it('Zapisz opens the options; the file size (Najlepsza / Do maila / Do urzędu) is passed to the export and remembered', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    const size = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(screen.getByRole('switch', { name: strings.searchableText })).toBeTruthy();
    expect(size(strings.sizeBest).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(size(strings.sizeOffice));
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    expect(vi.mocked(deps.exportPdf).mock.calls[0][3]).toMatchObject({ compress: 1 });

    fireEvent.click(saveButton());
    expect(size(strings.sizeOffice).getAttribute('aria-pressed')).toBe('true');
  });

  it('"Najlepsza jakość" saves once at full quality', async () => {
    const { deps, store } = setup();
    await act(() => store.export({ size: 'best', ocr: false, format: 'pdf' }));
    expect(vi.mocked(deps.exportPdf).mock.calls.map((c) => c[3].compress)).toEqual([0]);
  });

  it('"Do maila (do 18 MB)": first at full quality; too big, it is saved again smaller until it fits; the last one is saved', async () => {
    const bySize: Record<number, number> = { 0: 30_000_000, 1: 25_000_000, 2: 3_000_000 };
    const exportPdf = vi.fn(
      async (_d: unknown, _s: unknown, _p: unknown, o: { compress: number }) => new Uint8Array(bySize[o.compress] ?? 10),
    );
    const { deps, store } = setup({ exportPdf });
    await act(() => store.export({ size: 'mail', ocr: false, format: 'pdf' }));
    expect(exportPdf.mock.calls.map((c) => c[3].compress)).toEqual([0, 1, 2]);
    expect(vi.mocked(deps.download)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.download).mock.calls[0][0].size).toBe(3_000_000);
    expect(store.getState().notice).toContain(formatSize(3_000_000));
  });

  it('"Do urzędu (do 5 MB)" that cannot fit: the smallest possible file is saved and the app says how big it is', async () => {
    const exportPdf = vi.fn(async () => new Uint8Array(20_000_000));
    const { deps, store } = setup({ exportPdf });
    await act(() => store.export({ size: 'office', ocr: false, format: 'pdf' }));
    expect(exportPdf.mock.calls.map((c) => (c as unknown as [unknown, unknown, unknown, { compress: number }])[3].compress)).toEqual([
      1, 3, 5,
    ]);
    expect(vi.mocked(deps.download)).toHaveBeenCalledTimes(1);
    expect(store.getState().notice).toContain(strings.sizeTooBig(formatSize(4_990_000), formatSize(20_000_000)));
  });

  it('JPG with "Do urzędu": the pictures together fit the limit', async () => {
    const exportImages = vi.fn(async (_d: unknown, _s: unknown, _p: unknown, o: { compress: number }) =>
      o.compress < 2 ? [new Blob([new Uint8Array(4_000_000)]), new Blob([new Uint8Array(4_000_000)])] : [new Blob([new Uint8Array(1_000)])],
    );
    const { deps, store } = setup({ exportImages });
    await act(() => store.export({ size: 'office', ocr: false, format: 'jpg' }));
    expect(exportImages.mock.calls.map((c) => c[3].compress)).toEqual([1, 2]);
    expect(vi.mocked(deps.download)).toHaveBeenCalledTimes(1);
  });

  it('the sheet closes without saving', () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: strings.cancel }));
    expect(screen.queryByRole('group', { name: strings.fileSize })).toBeNull();
    expect(deps.exportPdf).not.toHaveBeenCalled();
  });

  it('after saving the notice shows the file size', async () => {
    setup({ exportPdf: vi.fn(async () => new Uint8Array(1_200_000)) });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(screen.getByText(/1,2 MB/)).toBeTruthy());
  });

  it('a running export can be cancelled', async () => {
    let signal: AbortSignal | undefined;
    setup({
      exportPdf: vi.fn((_d, _s, _p, opts) => {
        signal = opts.signal;
        return new Promise<Uint8Array>((_, reject) =>
          opts.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        );
      }),
    });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.cancel })));
    expect(signal!.aborted).toBe(true);
    await waitFor(() => expect(saveButton()).toBeTruthy());
    expect(screen.queryByText(strings.exportError)).toBeNull();
  });
});

describe('searchable text', () => {
  it('passes an OCR engine to the export and shows the OCR progress', async () => {
    const engine = { textLayer: vi.fn(), dispose: vi.fn(async () => {}) };
    let report: ((d: number, t: number) => void) | undefined;
    let finish: (b: Uint8Array) => void = () => {};
    const { deps } = setup({
      createOcr: vi.fn(async () => engine),
      exportPdf: vi.fn((_d, _s, onProgress) => {
        report = onProgress;
        return new Promise<Uint8Array>((r) => (finish = r));
      }),
    });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('switch', { name: strings.searchableText }));
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.exportPdf).toHaveBeenCalled());
    expect(vi.mocked(deps.exportPdf).mock.calls[0][3]).toMatchObject({ ocr: engine });
    act(() => report!(1, 2));
    expect(screen.getByRole('button', { name: strings.ocrProgress(1, 2) })).toBeTruthy();
    await act(async () => finish(new Uint8Array([1])));
  });

  it('when OCR cannot start (offline, first German use) the file is still saved and the user is told', async () => {
    const { store, deps } = setup({
      createOcr: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await act(() => store.export({ size: 'best', ocr: true, format: 'pdf' }));
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.exportPdf).mock.calls[0][3]).toMatchObject({ ocr: null });
    expect(store.getState().notice).toContain(strings.ocrUnavailable);
  });
});

describe('formatSize', () => {
  it('MB with one decimal, kB below 1 MB, in the language format', () => {
    expect(formatSize(1_200_000, 'pl')).toBe('1,2 MB');
    expect(formatSize(1_200_000, 'en')).toBe('1.2 MB');
    expect(formatSize(420_000, 'pl')).toBe('420 kB');
  });
});

describe('save sheet: name, chosen pages, JPG', () => {
  it('the file name can be changed before saving', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    const name = screen.getByRole('textbox', { name: strings.fileName }) as HTMLInputElement;
    expect(name.value).toBe('skan (poprawiony)');
    fireEvent.change(name, { target: { value: 'Umowa najmu' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    expect(vi.mocked(deps.download).mock.calls[0][0].name).toBe('Umowa najmu.pdf');
  });

  it('select mode: "Zapisz zaznaczone" saves only the chosen pages as their own file', async () => {
    const { deps, store } = setup();
    act(() => {
      store.toggleSelecting();
      store.toggleSelected('p2');
    });
    fireEvent.click(screen.getByRole('button', { name: strings.saveSelected }));
    expect(screen.getByText(strings.pageLookCount(1))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.exportPdf).toHaveBeenCalled());
    const doc = vi.mocked(deps.exportPdf).mock.calls[0][0];
    expect(doc.pages.map((p) => p.id)).toEqual(['p2']);
  });

  it('JPG: every page becomes a picture, named after the file', async () => {
    const exportImages = vi.fn(async () => [new Blob(['a']), new Blob(['b'])]);
    const { deps } = setup({ exportImages });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: 'JPG' }));
    fireEvent.change(screen.getByRole('textbox', { name: strings.fileName }), { target: { value: 'Faktura' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalledTimes(2));
    expect(deps.exportPdf).not.toHaveBeenCalled();
    expect(vi.mocked(deps.download).mock.calls.map(([f]) => f.name)).toEqual(['Faktura 1.jpg', 'Faktura 2.jpg']);
    expect(vi.mocked(deps.download).mock.calls[0][0].type).toBe('image/jpeg');
  });
});

describe('save sheet: pages, one file per page, password, send', () => {
  it('"Strony": only the typed pages are saved; a wrong range blocks saving', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    const pages = screen.getByRole('textbox', { name: strings.pagesField });
    fireEvent.change(pages, { target: { value: '9' } });
    expect(screen.getByText(strings.pagesInvalid(2))).toBeTruthy();
    expect((screen.getByRole('button', { name: strings.saveConfirm }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(pages, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.exportPdf).toHaveBeenCalled());
    expect(vi.mocked(deps.exportPdf).mock.calls[0][0].pages.map((p) => p.id)).toEqual(['p2']);
  });

  it('"Każda strona osobno": one PDF per page, numbered', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('switch', { name: strings.splitPages }));
    fireEvent.change(screen.getByRole('textbox', { name: strings.fileName }), { target: { value: 'Umowa' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalledTimes(2));
    expect(vi.mocked(deps.exportPdf).mock.calls.map(([d]) => d.pages.map((p) => p.id))).toEqual([['p1'], ['p2']]);
    expect(vi.mocked(deps.download).mock.calls.map(([f]) => f.name)).toEqual(['Umowa 1.pdf', 'Umowa 2.pdf']);
  });

  it('password: the PDF is locked with the typed password; an empty password blocks saving; it is not remembered', async () => {
    const encryptPdf = vi.fn(async () => new Uint8Array([7, 7]));
    const { deps } = setup({ encryptPdf });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('switch', { name: strings.passwordSwitch }));
    expect((screen.getByRole('button', { name: strings.saveConfirm }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(strings.passwordField), { target: { value: 'tajne1' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    expect(encryptPdf).toHaveBeenCalledWith(new Uint8Array([1]), 'tajne1');
    expect(vi.mocked(deps.download).mock.calls[0][0].size).toBe(2);

    fireEvent.click(saveButton());
    expect(screen.getByRole('switch', { name: strings.passwordSwitch }).getAttribute('aria-checked')).toBe('false');
    expect(JSON.stringify(deps.storage)).not.toContain('tajne1');
  });

  it('"Wyślij": after building, one tap opens the phone\'s share menu', async () => {
    const { deps } = setup({ canShareFiles: true });
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: strings.sendConfirm }));
    const send = await screen.findByRole('button', { name: strings.sendNow });
    expect(deps.download).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(send));
    expect(deps.share).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.share).mock.calls[0][0]).toMatchObject({ name: 'skan (poprawiony).pdf' });
  });

  it('no "Wyślij" where the browser cannot share files', () => {
    setup({ canShareFiles: false });
    fireEvent.click(saveButton());
    expect(screen.queryByRole('button', { name: strings.sendConfirm })).toBeNull();
  });
});

describe('save sheet: watermark', () => {
  it('"Znak wodny": the typed text and today’s date go on every page; an empty text blocks saving', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('switch', { name: strings.watermarkSwitch }));
    expect((screen.getByRole('button', { name: strings.saveConfirm }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: strings.watermarkField }), { target: { value: 'Kopia dla banku' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    const opts = vi.mocked(deps.exportPdf).mock.calls[0][3];
    expect(opts.watermark).toBe(`Kopia dla banku – ${new Date().toLocaleDateString('pl')}`);
  });

  it('works for JPG too', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: 'JPG' }));
    fireEvent.click(screen.getByRole('switch', { name: strings.watermarkSwitch }));
    fireEvent.change(screen.getByRole('textbox', { name: strings.watermarkField }), { target: { value: 'Tylko dla ZUS' } });
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    expect(vi.mocked(deps.exportImages).mock.calls[0][3].watermark).toMatch(/^Tylko dla ZUS – /);
  });
});

describe('Więcej opcji', () => {
  beforeEach(() => localStorage.clear());
  const openSave = () => fireEvent.click(screen.getByRole('button', { name: strings.save }));

  it('by default: name, PDF/JPG and size on top; the rest under "Więcej opcji", folded; opening it is remembered', () => {
    setup();
    openSave();
    expect(screen.getByRole('group', { name: strings.format })).toBeTruthy();
    expect(screen.getByRole('group', { name: strings.fileSize })).toBeTruthy();
    const more = screen.getByRole('button', { name: strings.moreSaveOptions });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('switch', { name: strings.passwordSwitch })).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole('textbox', { name: strings.pagesField })).toBeTruthy();
    expect(screen.getByRole('switch', { name: strings.searchableText })).toBeTruthy();
    expect(screen.getByRole('switch', { name: strings.splitPages })).toBeTruthy();
    expect(screen.getByRole('switch', { name: strings.watermarkSwitch })).toBeTruthy();
    expect(screen.getByRole('switch', { name: strings.passwordSwitch })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.cancel }));
    openSave();
    expect(screen.getByRole('button', { name: strings.moreSaveOptions }).getAttribute('aria-expanded')).toBe('true');
  });

  it('something on inside (the remembered searchable text): "Więcej opcji" opens by itself', () => {
    setup({ storage: { getItem: () => JSON.stringify({ size: 'best', ocr: true, format: 'pdf' }), setItem: () => {} } });
    openSave();
    expect(screen.getByRole('switch', { name: strings.searchableText }).getAttribute('aria-checked')).toBe('true');
  });

});
