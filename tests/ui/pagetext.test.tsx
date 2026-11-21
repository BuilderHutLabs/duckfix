import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

function openPreview(deps = fakeDeps()) {
  const store = createAppStore(deps);
  store.load(docWithFlags(1), [source]);
  render(<App store={store} />);
  act(() => store.openPreview('p1'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-tap guard
  return store;
}

describe('copy text from a page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('"Kopiuj tekst" shows the page text, and Kopiuj puts it on the clipboard', async () => {
    const deps = fakeDeps({ pageText: vi.fn(async () => 'Zażółć gęślą jaźń'), copyText: vi.fn(async () => {}) });
    openPreview(deps);
    fireEvent.click(screen.getByRole('button', { name: strings.copyText }));
    const box = (await screen.findByRole('textbox', { name: strings.pageText })) as HTMLTextAreaElement;
    expect(box.value).toBe('Zażółć gęślą jaźń');
    fireEvent.click(screen.getByRole('button', { name: strings.copy }));
    await waitFor(() => expect(deps.copyText).toHaveBeenCalledWith('Zażółć gęślą jaźń'));
    expect(await screen.findByRole('button', { name: strings.copied })).toBeTruthy();
  });

  it('a page without text says so', async () => {
    openPreview(fakeDeps({ pageText: vi.fn(async () => '   ') }));
    fireEvent.click(screen.getByRole('button', { name: strings.copyText }));
    expect(await screen.findByText(strings.noText)).toBeTruthy();
  });
});
