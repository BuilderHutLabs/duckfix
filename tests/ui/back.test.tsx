import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { resetBackStack } from '../../src/ui/backStack';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));
vi.mock('../../src/scan/warp', () => ({
  loadPhoto: vi.fn(async () => ({ width: 4000, height: 3000, url: 'blob:photo', bitmap: {}, close: vi.fn() })),
  findSheet: vi.fn(() => null),
  warpToBlob: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
  warpPreview: vi.fn(async () => 'blob:preview'),
}));

/** The phone's Back: the browser steps back in its history. */
const back = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: null })));

function openDoc() {
  const store = createAppStore(fakeDeps());
  store.load(docWithFlags(2), [source]);
  render(<App store={store} />);
  return store;
}

describe('Wstecz (the phone’s Back)', () => {
  let push: ReturnType<typeof vi.spyOn>;
  let goBack: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetBackStack();
    push = vi.spyOn(window.history, 'pushState');
    goBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('closes an open sheet first; the document stays', () => {
    openDoc();
    fireEvent.click(screen.getByRole('button', { name: strings.save }));
    expect(screen.getByRole('dialog', { name: strings.saveOptions })).toBeTruthy();
    back();
    expect(screen.queryByRole('dialog', { name: strings.saveOptions })).toBeNull();
    expect(screen.getByRole('button', { name: strings.save })).toBeTruthy(); // still the document
  });

  it('then the page preview, then the document goes back to the home screen', () => {
    const store = openDoc();
    act(() => store.openPreview('p1'));
    back();
    expect(store.getState().previewId).toBeNull();
    expect(store.getState().phase).not.toBe('home');
    back();
    expect(store.getState().phase).toBe('home');
  });

  it('a sheet over the preview: Back closes the sheet, the preview stays', () => {
    const store = openDoc();
    act(() => store.openPreview('p1'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-click guard
    fireEvent.click(screen.getByRole('button', { name: strings.copyText }));
    expect(screen.getByRole('dialog', { name: strings.pageText })).toBeTruthy();
    back();
    expect(screen.queryByRole('dialog', { name: strings.pageText })).toBeNull();
    expect(store.getState().previewId).toBe('p1');
  });

  it('each open screen adds one step; closing it by hand takes its step away (Back is not needed twice)', async () => {
    openDoc();
    const before = push.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: strings.save }));
    expect(push.mock.calls.length).toBe(before + 1);
    fireEvent.click(screen.getByRole('button', { name: strings.cancel }));
    await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
  });

  it('a screen mounted twice at once (React StrictMode) keeps one step', async () => {
    const { StrictMode } = await import('react');
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(2), [source]);
    const before = push.mock.calls.length;
    render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(push.mock.calls.length - before).toBe(1); // the document's one step
    expect(goBack).not.toHaveBeenCalled();
  });

  it('the crop screen of a photo closes on Back', async () => {
    const store = createAppStore(fakeDeps());
    render(<App store={store} />);
    await act(async () => store.setScanPhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' })));
    expect(await screen.findByRole('dialog', { name: strings.cropTitle })).toBeTruthy();
    back();
    expect(screen.queryByRole('dialog', { name: strings.cropTitle })).toBeNull();
  });
});
