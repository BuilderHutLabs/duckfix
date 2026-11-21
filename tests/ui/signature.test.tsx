import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { saveSignature, loadSignature, clearSignature } from '../../src/signature/storage';
import { addStamp, moveStamp, removeStamp } from '../../src/model/document';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

const SIG = { src: 'data:image/png;base64,AAAA', aspect: 4 };

describe('signature', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('is remembered on the phone and can be forgotten', () => {
    expect(loadSignature()).toBeNull();
    saveSignature(SIG);
    expect(loadSignature()).toEqual(SIG);
    clearSignature();
    expect(loadSignature()).toBeNull();
  });

  it('model: add, move and remove a signature on a page', () => {
    let doc = addStamp(docWithFlags(1), 'p1', { id: 's1', src: SIG.src, x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
    expect(doc.pages[0].stamps).toHaveLength(1);
    doc = moveStamp(doc, 'p1', 's1', { x: 0.5, y: 0.6, w: 0.4, h: 0.06 });
    expect(doc.pages[0].stamps![0]).toMatchObject({ x: 0.5, y: 0.6, w: 0.4, h: 0.06 });
    doc = removeStamp(doc, 'p1', 's1');
    expect(doc.pages[0].stamps).toEqual([]);
  });

  it('"Podpisz" in the page preview: no signature yet opens the signature sheet (draw or scan)', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    // the preview ignores taps in its first 0.4 s (ghost click of the hold that opened it)
    const later = Date.now() + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    expect(screen.getByRole('dialog', { name: strings.signatureTitle })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.signatureDraw })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.signatureScan })).toBeTruthy();
  });

  it('with a saved signature "Podpisz" places it on the page (undoable), and it can be removed', () => {
    saveSignature(SIG);
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    // the preview ignores taps in its first 0.4 s (ghost click of the hold that opened it)
    const later = Date.now() + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    const stamps = () => store.getState().doc.pages[0].stamps ?? [];
    expect(stamps()).toHaveLength(1);
    expect(stamps()[0].src).toBe(SIG.src);
    expect(within(screen.getByRole('dialog', { name: strings.preview(1) })).getByRole('img', { name: strings.signature })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.removeSignature }));
    expect(stamps()).toHaveLength(0);
    act(() => store.undo());
    expect(stamps()).toHaveLength(1);
  });

  it('a signed page shows its signature on the thumbnail', () => {
    const store = createAppStore(fakeDeps());
    const doc = addStamp(docWithFlags(2), 'p2', { id: 's1', src: SIG.src, x: 0.5, y: 0.8, w: 0.3, h: 0.07 });
    store.load(doc, [source]);
    render(<App store={store} />);
    expect(screen.getAllByRole('img', { name: strings.signature })).toHaveLength(1);
  });

  it('drawing: blue or black ink', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    const blue = screen.getByRole('button', { name: strings.inkBlue });
    const black = screen.getByRole('button', { name: strings.inkBlack });
    expect(blue.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(black);
    expect(black.getAttribute('aria-pressed')).toBe('true');
  });
});
