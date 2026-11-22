import { act, fireEvent, render, screen } from '@testing-library/react';
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
// drawing the stamp needs a real canvas; jsdom has none
vi.mock('../../src/edit/stampImage', () => ({
  stampImage: vi.fn((kind: string, ink: string) => ({ src: `data:image/png;base64,${kind}-${ink}`, aspect: 2.5 })),
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
    expect(st[0].src).toBe('data:image/png;base64,copy-red');
    expect(st[0].w / st[0].h).toBeGreaterThan(1); // keeps its shape
    act(() => store.undo());
    expect(store.getState().doc.pages[0].stamps ?? []).toHaveLength(0);
  });

  it('blue ink: the stamp is blue, and blue is chosen the next time', () => {
    const store = openStamps();
    fireEvent.click(screen.getByRole('button', { name: strings.stampInkBlue }));
    fireEvent.click(screen.getByRole('button', { name: strings.stampCopy }));
    expect(store.getState().doc.pages[0].stamps![0].src).toBe('data:image/png;base64,copy-blue');
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
});
