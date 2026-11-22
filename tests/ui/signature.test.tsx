import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { addSignature, loadSignatures, removeSignature } from '../../src/signature/storage';
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

  it('several signatures and initials are remembered on the phone, newest first, and can be removed', () => {
    expect(loadSignatures()).toEqual([]);
    const a = addSignature(SIG, 'signature');
    const b = addSignature({ src: 'data:image/png;base64,BBBB', aspect: 1.5 }, 'initials');
    expect(loadSignatures().map((x) => [x.id, x.kind])).toEqual([
      [b.id, 'initials'],
      [a.id, 'signature'],
    ]);
    removeSignature(a.id);
    expect(loadSignatures().map((x) => x.id)).toEqual([b.id]);
  });

  it('the one signature saved by an earlier version is kept', () => {
    localStorage.setItem('duckfix-signature', JSON.stringify(SIG));
    expect(loadSignatures()).toEqual([expect.objectContaining({ ...SIG, kind: 'signature' })]);
  });

  it('model: add, move and remove a signature on a page', () => {
    let doc = addStamp(docWithFlags(1), 'p1', { id: 's1', src: SIG.src, x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
    expect(doc.pages[0].stamps).toHaveLength(1);
    doc = moveStamp(doc, 'p1', 's1', { x: 0.5, y: 0.6, w: 0.4, h: 0.06 });
    expect(doc.pages[0].stamps![0]).toMatchObject({ x: 0.5, y: 0.6, w: 0.4, h: 0.06 });
    doc = removeStamp(doc, 'p1', 's1');
    expect(doc.pages[0].stamps).toEqual([]);
  });

  it('Edytuj → "Podpisz" in the page preview: no signature yet opens the signature sheet (draw or scan)', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    // the preview ignores taps in its first 0.4 s (ghost click of the hold that opened it)
    const later = Date.now() + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(screen.getByRole('button', { name: strings.edit })); // Podpisz is one of the Edytuj tools
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    expect(screen.getByRole('dialog', { name: strings.signatureTitle })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.signatureDraw })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.signatureScan })).toBeTruthy();
  });

  it('with a saved signature "Podpisz" shows your signatures; a tap places it on the page (undoable), and it can be removed', () => {
    addSignature(SIG, 'signature');
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    // the preview ignores taps in its first 0.4 s (ghost click of the hold that opened it)
    const later = Date.now() + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(screen.getByRole('button', { name: strings.edit })); // Podpisz is one of the Edytuj tools
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    const picker = screen.getByRole('dialog', { name: strings.signaturesTitle });
    fireEvent.click(within(picker).getByRole('button', { name: strings.signatureLabel }));
    expect(screen.queryByRole('dialog', { name: strings.signaturesTitle })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: strings.edit })); // Podpisz is one of the Edytuj tools
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    const blue = screen.getByRole('button', { name: strings.inkBlue });
    const black = screen.getByRole('button', { name: strings.inkBlack });
    expect(blue.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(black);
    expect(black.getAttribute('aria-pressed')).toBe('true');
  });

  it('"Mój podpis" from the ⋯ menu opens over the whole screen, not inside the blurred top bar', () => {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(1), [source]);
    const { container } = render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: strings.more }));
    fireEvent.click(screen.getByRole('button', { name: strings.mySignature }));
    const sheet = screen.getByRole('dialog', { name: strings.signatureTitle });
    expect(sheet.closest('.toolbar')).toBeNull();
    expect(container.contains(sheet)).toBe(false);
    expect(sheet.parentElement?.parentElement).toBe(document.body);
  });

  it('a rotated signature is shown turned; tapping the turn handle turns it 90° (undoable)', () => {
    const store = createAppStore(fakeDeps());
    store.load(addStamp(docWithFlags(1), 'p1', { id: 's1', src: SIG.src, x: 0.1, y: 0.1, w: 0.3, h: 0.1, rot: 45 }), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    const preview = screen.getByRole('dialog', { name: strings.preview(1) });
    const stamp = within(preview).getByRole('img', { name: strings.signature }).parentElement!;
    expect(stamp.style.transform).toBe('rotate(45deg)');
    const handle = within(preview).getByRole('button', { name: strings.rotateSignature });
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(store.getState().doc.pages[0].stamps![0].rot).toBe(90);
    act(() => store.undo());
    expect(store.getState().doc.pages[0].stamps![0].rot).toBe(45);
  });

  function openSign(pages = 1) {
    const store = createAppStore(fakeDeps());
    store.load(docWithFlags(pages), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    return store;
  }

  it('initials go small into the lower right corner', () => {
    addSignature(SIG, 'signature');
    addSignature({ src: 'data:image/png;base64,CCCC', aspect: 1.5 }, 'initials');
    const store = openSign();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: strings.signaturesTitle })).getByRole('button', { name: strings.initialsLabel }),
    );
    const [st] = store.getState().doc.pages[0].stamps!;
    expect(st.src).toBe('data:image/png;base64,CCCC');
    expect(st.w).toBeLessThan(0.2);
    expect(st.x + st.w).toBeGreaterThan(0.9);
    expect(st.y + st.h).toBeGreaterThan(0.9);
  });

  it('"Parafuj wszystkie strony" puts the initials on every page', () => {
    addSignature({ src: 'data:image/png;base64,CCCC', aspect: 1.5 }, 'initials');
    const store = openSign(3);
    fireEvent.click(screen.getByRole('button', { name: strings.initialsAllPages }));
    expect(store.getState().doc.pages.map((p) => p.stamps?.length ?? 0)).toEqual([1, 1, 1]);
    expect(store.getState().doc.pages[2].stamps![0].src).toBe('data:image/png;base64,CCCC');
  });

  it('a saved signature can be removed from the phone (after asking); "+ Parafka" opens the initials pad', () => {
    addSignature(SIG, 'signature');
    openSign();
    const picker = screen.getByRole('dialog', { name: strings.signaturesTitle });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(picker).getByRole('button', { name: strings.signatureRemove }));
    expect(loadSignatures()).toEqual([]);
    fireEvent.click(within(picker).getByRole('button', { name: strings.initialsNew }));
    expect(screen.getByRole('dialog', { name: strings.initialsTitle })).toBeTruthy();
  });
});
