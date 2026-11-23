import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { docWithFlags, fakeDeps, source } from './fixtures';
import { addSignature, loadSignatures } from '../../src/signature/storage';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));
// drawing the stamp needs a real canvas; jsdom has none
vi.mock('../../src/edit/stampImage', () => ({
  stampImage: vi.fn((kind: string, ink: string, day?: Date) => ({
    src: `data:image/png;base64,${kind}-${ink}${day ? `-${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}` : ''}`,
    aspect: 2.5,
  })),
}));

function openStamps(pages = 1) {
  const store = createAppStore(fakeDeps());
  store.load(docWithFlags(pages), [source]);
  render(<App store={store} />);
  act(() => store.openPreview('p1'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-click guard
  fireEvent.click(screen.getByRole('button', { name: strings.edit }));
  fireEvent.click(screen.getByRole('button', { name: strings.stampTool }));
  return store;
}

describe('Pieczątka', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('"Pieczątka" in Edytuj shows the five stamps; a tap puts one on the page, selected (undoable)', () => {
    const store = openStamps();
    const sheet = screen.getByRole('dialog', { name: strings.stampTitle });
    expect(sheet.querySelectorAll('.stamp-pick')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: strings.stampCopy }));
    expect(screen.queryByRole('dialog', { name: strings.stampTitle })).toBeNull();
    const st = store.getState().doc.pages[0].stamps!;
    expect(st).toHaveLength(1);
    expect(st[0].src).toContain('copy-red');
    expect(st[0].w / st[0].h).toBeGreaterThan(1); // keeps its shape
    act(() => store.undo());
    expect(store.getState().doc.pages[0].stamps ?? []).toHaveLength(0);
  });

  it('blue ink: the stamp is blue, and blue is chosen the next time', () => {
    const store = openStamps();
    fireEvent.click(screen.getByRole('button', { name: strings.stampInkBlue }));
    fireEvent.click(screen.getByRole('button', { name: strings.stampCopy }));
    expect(store.getState().doc.pages[0].stamps![0].src).toContain('copy-blue');
    fireEvent.click(screen.getByRole('button', { name: strings.stampTool }));
    expect(screen.getByRole('button', { name: strings.stampInkBlue }).getAttribute('aria-pressed')).toBe('true');
  });

  it('"Na wszystkie strony" puts the stamp on every page', () => {
    const store = openStamps(3);
    fireEvent.click(screen.getByRole('checkbox', { name: strings.stampAllPages }));
    fireEvent.click(screen.getByRole('button', { name: strings.stampFiled }));
    expect(store.getState().doc.pages.map((p) => p.stamps?.length ?? 0)).toEqual([1, 1, 1]);
  });

  it('one page: no "Na wszystkie strony"', () => {
    openStamps(1);
    expect(screen.queryByRole('checkbox', { name: strings.stampAllPages })).toBeNull();
  });

  it('the date can be changed before placing: the stamps show it and the placed one keeps it', () => {
    const store = openStamps();
    fireEvent.change(screen.getByLabelText(strings.stampDate), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings.stampPaid}`) }));
    const st = store.getState().doc.pages[0].stamps![0];
    expect(st.src).toContain('paid-red-2026-11-20');
    expect(st.preset).toEqual({ kind: 'paid', ink: 'red', date: '2026-11-20' });
  });

  it('a placed stamp with a date: "Zmień datę" in its bubble draws it again with the new date, same place (undoable)', () => {
    const store = openStamps();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings.stampReceived}`) }));
    const before = store.getState().doc.pages[0].stamps![0];
    fireEvent.click(screen.getByRole('button', { name: strings.stampChangeDate }));
    const sheet = screen.getByRole('dialog', { name: strings.stampDateTitle });
    fireEvent.change(within(sheet).getByLabelText(strings.stampDate), { target: { value: '2026-12-01' } });
    fireEvent.click(within(sheet).getByRole('button', { name: strings.stampDateApply }));
    const after = store.getState().doc.pages[0].stamps![0];
    expect(after.src).toContain('received-red-2026-12-1');
    expect(after.preset!.date).toBe('2026-12-01');
    expect([after.x, after.y, after.w, after.h]).toEqual([before.x, before.y, before.w, before.h]);
    act(() => store.undo());
    expect(store.getState().doc.pages[0].stamps![0].src).toBe(before.src);
  });

  it('"Kopia" has no date: no "Zmień datę"', () => {
    openStamps();
    fireEvent.click(screen.getByRole('button', { name: strings.stampCopy }));
    expect(screen.queryByRole('button', { name: strings.stampChangeDate })).toBeNull();
  });

  it('"+ Dodaj swoją pieczątkę" opens the photo sheet (no drawing pad)', () => {
    openStamps();
    fireEvent.click(screen.getByRole('button', { name: strings.stampOwnAdd }));
    expect(screen.getByRole('dialog', { name: strings.stampOwnTitle })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings.signatureDraw })).toBeNull();
    expect(screen.getByText(strings.stampOwnHint)).toBeTruthy();
  });

  it('your own stamps are listed first and placed with a tap; they are not among the signatures; removable', () => {
    addSignature({ src: 'data:image/png;base64,FIRMA', aspect: 2 }, 'stamp');
    addSignature({ src: 'data:image/png;base64,PODPIS', aspect: 4 }, 'signature');
    const store = openStamps();
    const own = screen.getByRole('group', { name: strings.stampOwn });
    fireEvent.click(within(own).getByRole('button', { name: strings.stampOwnLabel }));
    expect(store.getState().doc.pages[0].stamps![0].src).toBe('data:image/png;base64,FIRMA');
    // "Podpisz" lists only the signature
    fireEvent.click(screen.getByRole('button', { name: strings.sign }));
    const sigs = screen.getByRole('dialog', { name: strings.signaturesTitle });
    expect(sigs.querySelectorAll('.sig-tile')).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    // removed from the phone after asking
    fireEvent.click(screen.getByRole('button', { name: strings.stampTool }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(screen.getByRole('group', { name: strings.stampOwn })).getByRole('button', { name: strings.signatureRemove }));
    expect(loadSignatures().map((x) => x.kind)).toEqual(['signature']);
    expect(screen.queryByRole('group', { name: strings.stampOwn })).toBeNull();
  });

  it('a second stamp goes under the first one instead of on top of it', () => {
    const store = openStamps();
    fireEvent.click(screen.getByRole('button', { name: strings.stampCopy }));
    fireEvent.click(screen.getByRole('button', { name: strings.stampTool }));
    fireEvent.click(screen.getByRole('button', { name: strings.stampFiled }));
    const [a, b] = store.getState().doc.pages[0].stamps!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
  });
});
