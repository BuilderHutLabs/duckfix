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

function setup(over = {}) {
  const deps = fakeDeps({ shareFirst: false, storage: memoryStorage(), ...over });
  const store = createAppStore(deps);
  store.load(docWithFlags(2), [source]);
  render(<App store={store} />);
  return { deps, store };
}

const saveButton = () => screen.getByRole('button', { name: strings.save });

describe('save sheet', () => {
  it('Zapisz opens the options; Mniejszy plik is passed to the export and remembered', async () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    const smaller = screen.getByRole('switch', { name: strings.smallerFile });
    expect(screen.getByRole('switch', { name: strings.searchableText })).toBeTruthy();
    expect(smaller.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(smaller);
    fireEvent.click(screen.getByRole('button', { name: strings.saveConfirm }));
    await waitFor(() => expect(deps.download).toHaveBeenCalled());
    expect(vi.mocked(deps.exportPdf).mock.calls[0][3]).toMatchObject({ compress: true });

    fireEvent.click(saveButton());
    expect(screen.getByRole('switch', { name: strings.smallerFile }).getAttribute('aria-checked')).toBe('true');
  });

  it('the sheet closes without saving', () => {
    const { deps } = setup();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: strings.cancel }));
    expect(screen.queryByRole('switch', { name: strings.smallerFile })).toBeNull();
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
    const { store, deps } = setup({ createOcr: vi.fn(async () => { throw new Error('offline'); }) });
    await act(() => store.export({ compress: false, ocr: true }));
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
