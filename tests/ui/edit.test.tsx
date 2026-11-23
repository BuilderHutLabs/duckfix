import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { BUBBLE_GAP, bubblePlace } from '../../src/ui/edit/MarkLayer';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { addMark, setCrop } from '../../src/model/document';
import { docWithFlags, fakeDeps, source } from './fixtures';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

/** jsdom has no layout: every element is 500×700 at the origin, so the page box is the whole stage. */
function fakeLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 500,
    height: 700,
    right: 500,
    bottom: 700,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
}

function openPreview(doc = docWithFlags(1)) {
  fakeLayout();
  const store = createAppStore(fakeDeps());
  store.load(doc, [source]);
  render(<App store={store} />);
  act(() => store.openPreview('p1'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-tap guard
  return store;
}

const marks = (store: ReturnType<typeof createAppStore>) => store.getState().doc.pages[0].marks ?? [];
/** Groups that sit under "Więcej" on the tool row. */
const IN_MORE = () => [strings.toolHighlight, strings.toolShapes, strings.groupHide, strings.stampTool, strings.qrTool];
/** Opens a group of tools in the edit panel (Pisz is open at first); "Więcej" first for the rarer ones. */
const openGroup = (name: string) => {
  if (IN_MORE().includes(name)) fireEvent.click(screen.getByRole('button', { name: strings.toolsMore }));
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('Edytuj', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the top bar has Tekst, Edytuj, Obróć; Edytuj shows the tools and Gotowe', () => {
    openPreview();
    const preview = screen.getByRole('dialog', { name: strings.preview(1) });
    expect(within(preview).queryByRole('button', { name: strings.sign })).toBeNull(); // moved into the tools
    fireEvent.click(within(preview).getByRole('button', { name: strings.edit }));
    expect(within(preview).getByRole('button', { name: strings.toolWrite })).toBeTruthy();
    fireEvent.click(within(preview).getByRole('button', { name: strings.toolsMore }));
    fireEvent.click(within(preview).getByRole('button', { name: strings.groupHide }));
    expect(within(preview).getByRole('button', { name: strings.cover })).toBeTruthy();
    expect(within(preview).getByRole('button', { name: strings.sign })).toBeTruthy();
    fireEvent.click(within(preview).getByRole('button', { name: strings.editDone }));
    expect(within(preview).queryByRole('button', { name: strings.cover })).toBeNull();
  });

  it('Zasłoń: dragging over the page adds a black cover there (one undo step)', () => {
    const store = openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    fireEvent.click(screen.getByRole('button', { name: strings.cover }));
    const layer = document.querySelector('.mark-layer') as HTMLElement;
    fireEvent.pointerDown(layer, { clientX: 50, clientY: 70, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 300, clientY: 140, pointerId: 1 });
    expect(marks(store)).toHaveLength(1);
    expect(marks(store)[0]).toMatchObject({ kind: 'cover', color: 'black' });
    const m = marks(store)[0] as { x: number; y: number; w: number; h: number };
    expect(m.x).toBeCloseTo(0.1);
    expect(m.y).toBeCloseTo(0.1);
    expect(m.w).toBeCloseTo(0.5);
    expect(m.h).toBeCloseTo(0.1);
    act(() => store.undo());
    expect(marks(store)).toHaveLength(0);
  });

  it('white cover: choose Biały first', () => {
    const store = openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    fireEvent.click(screen.getByRole('button', { name: strings.cover }));
    fireEvent.click(screen.getByRole('button', { name: strings.coverWhite }));
    const layer = document.querySelector('.mark-layer') as HTMLElement;
    fireEvent.pointerDown(layer, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 100, clientY: 100, pointerId: 1 }); // a tap: default size
    expect(marks(store)[0]).toMatchObject({ kind: 'cover', color: 'white' });
  });

  it('a cover can be selected and removed with ×', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'c1', kind: 'cover', color: 'black', x: 0.1, y: 0.1, w: 0.3, h: 0.1 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const item = document.querySelector('[data-mark="c1"]') as HTMLElement;
    fireEvent.pointerDown(item, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: strings.removeMark }));
    expect(marks(store)).toHaveLength(0);
  });

  it('covers are shown on the page also outside Edytuj', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'c1', kind: 'cover', color: 'black', x: 0.1, y: 0.1, w: 0.3, h: 0.1 });
    openPreview(doc);
    expect(document.querySelector('.mark-layer rect[data-kind="cover"]')).toBeTruthy();
  });

  it('Kadruj: dragging a corner of the frame crops the page (one undo step per drag)', () => {
    const store = openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    fireEvent.click(screen.getByRole('button', { name: strings.pageCrop }));
    const se = document.querySelector('.crop-frame [data-handle="se"]') as HTMLElement;
    fireEvent.pointerDown(se, { clientX: 500, clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(se, { clientX: 400, clientY: 560, pointerId: 1 });
    fireEvent.pointerUp(se, { clientX: 400, clientY: 560, pointerId: 1 });
    const crop = store.getState().doc.pages[0].crop!;
    expect(crop.x).toBeCloseTo(0);
    expect(crop.w).toBeCloseTo(0.8);
    expect(crop.h).toBeCloseTo(0.8);
    act(() => store.undo());
    expect(store.getState().doc.pages[0].crop).toBeUndefined();
  });

  it('"Dla wszystkich stron" gives every page the same crop; "Bez kadrowania" takes it off this page', () => {
    const store = openPreview(setCrop(docWithFlags(3), ['p1'], { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }));
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    fireEvent.click(screen.getByRole('button', { name: strings.pageCrop }));
    fireEvent.click(screen.getByRole('button', { name: strings.pageCropAll }));
    expect(store.getState().doc.pages.map((p) => p.crop?.w)).toEqual([0.8, 0.8, 0.8]);
    fireEvent.click(screen.getByRole('button', { name: strings.pageCropNone }));
    expect(store.getState().doc.pages.map((p) => p.crop?.w)).toEqual([undefined, 0.8, 0.8]);
  });

  it('"Ukryj dane osobowe" reads the page and covers a PESEL and a phone in one undo step', async () => {
    const pesel = {
      words: [
        { text: 'PESEL', bbox: { x0: 0.1, y0: 0.2, x1: 0.2, y1: 0.22 } },
        { text: '44051401359', bbox: { x0: 0.22, y0: 0.2, x1: 0.4, y1: 0.22 } },
      ],
    };
    const phone = {
      words: ['601', '234', '567'].map((t, i) => ({ text: t, bbox: { x0: 0.5 + i * 0.06, y0: 0.5, x1: 0.55 + i * 0.06, y1: 0.52 } })),
    };
    fakeLayout();
    const deps = fakeDeps({ pageLines: vi.fn(async () => [pesel, phone]) });
    const store = createAppStore(deps);
    store.load(docWithFlags(1), [source]);
    render(<App store={store} />);
    act(() => store.openPreview('p1'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.hidePersonal })));
    const covers = marks(store).filter((m) => m.kind === 'cover') as Array<{ x: number; w: number; color: string }>;
    expect(covers).toHaveLength(2);
    expect(covers[0].x).toBeLessThan(0.22);
    expect(covers[0].x + covers[0].w).toBeGreaterThan(0.4);
    expect(covers[1].x + covers[1].w).toBeGreaterThan(0.67); // all three groups of the phone
    expect(screen.getByText(strings.personalFound(2))).toBeTruthy();
    act(() => store.undo());
    expect(marks(store)).toHaveLength(0);
  });

  it('"Ukryj dane osobowe" says so when there is nothing to hide', async () => {
    openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupHide);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: strings.hidePersonal })));
    expect(screen.getByText(strings.personalNone)).toBeTruthy();
  });

  it('outside Kadruj the preview shows only the cropped part', () => {
    openPreview(setCrop(docWithFlags(1), ['p1'], { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }));
    const page = document.querySelector('.preview-clip') as HTMLElement;
    // page box 500×700 at the origin: inset top 140, right 200, bottom 210, left 50
    expect(page.style.clipPath).toBe('inset(140px 200px 210px 50px)');
  });

  it('on a cropped page the bubble of a selected item is drawn outside the cut, so it is never clipped', () => {
    const doc = addMark(setCrop(docWithFlags(1), ['p1'], { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }), 'p1', {
      id: 'r1',
      kind: 'rect',
      color: 'green',
      x: 0.2,
      y: 0.3,
      w: 0.2,
      h: 0.2,
    });
    openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const item = document.querySelector('.mark-item') as HTMLElement;
    fireEvent.pointerDown(item, { clientX: 150, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 150, clientY: 250, pointerId: 1 });
    const bubble = screen.getByRole('group', { name: strings.selectedItem });
    expect(bubble.closest('.preview-bubbles')).not.toBeNull();
    expect(bubble.closest('.preview-clip')).toBeNull();
  });

  it('the bubble keeps clear of the corner dots, and of the turn knob of a signature', () => {
    const rect = { left: 0, top: 0, width: 500, height: 700, stageW: 500, stageH: 700 };
    const box = { x: 0.2, y: 0.5, w: 0.4, h: 0.1 };
    const itemTop = 0.5 * 700;
    expect(itemTop - bubblePlace(box, rect).top).toBeGreaterThanOrEqual(48); // dots reach ~25 px out with their touch area
    expect(itemTop - bubblePlace(box, rect, 1, BUBBLE_GAP.stamp).top).toBeGreaterThanOrEqual(64);
  });

  it('no room over or under an item (a square over the whole page): the bubble goes into its middle, away from the dots', () => {
    const rect = { left: 0, top: 0, width: 500, height: 700, stageW: 500, stageH: 700 };
    const at = bubblePlace({ x: 0.02, y: 0.02, w: 0.96, h: 0.96 }, rect);
    expect(at.inside).toBe(true);
    expect(at.top).toBeCloseTo(0.5 * 700);
  });

  it('no room over an item at the top: the bubble goes under it, still clear of the dots', () => {
    const rect = { left: 0, top: 0, width: 500, height: 700, stageW: 500, stageH: 700 };
    const at = bubblePlace({ x: 0.2, y: 0.02, w: 0.4, h: 0.1 }, rect);
    expect(at.above).toBe(false);
    expect(at.inside).toBeFalsy();
    expect(at.top - 0.12 * 700).toBeGreaterThanOrEqual(48);
  });

  it('miniatures show covers and the crop', () => {
    fakeLayout();
    let doc = addMark(docWithFlags(2), 'p1', { id: 'c1', kind: 'cover', color: 'black', x: 0.1, y: 0.1, w: 0.3, h: 0.1 });
    doc = setCrop(doc, ['p2'], { x: 0, y: 0, w: 0.5, h: 1 });
    const store = createAppStore(fakeDeps());
    store.load(doc, [source]);
    render(<App store={store} />);
    const thumbs = document.querySelectorAll('.thumb-box');
    expect(thumbs[0].querySelector('rect[data-kind="cover"]')).toBeTruthy();
    expect((thumbs[1] as HTMLElement).style.clipPath).toBe('inset(0px 250px 0px 0px)');
  });
});

describe('Edytuj: tekst, ✓/✗, data', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const tap = (el: Element, x: number, y: number) => {
    fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });
  };
  const layer = () => document.querySelector('.mark-layer') as HTMLElement;
  // the tool row holds groups; a tool of a group is chosen in the row above it
  const MAIN: Record<string, string> = {
    [strings.toolTick]: strings.toolMarks,
    [strings.toolCross]: strings.toolMarks,
    [strings.toolDate]: strings.toolMarks,
    [strings.toolPen]: strings.groupDraw,
    [strings.toolEraser]: strings.groupDraw,
    [strings.toolArrow]: strings.toolShapes,
    [strings.toolRect]: strings.toolShapes,
    [strings.toolEllipse]: strings.toolShapes,
  };
  const startTool = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    if (MAIN[name]) openGroup(MAIN[name]);
    if (IN_MORE().includes(name)) openGroup(name);
    else fireEvent.click(screen.getByRole('button', { name }));
  };
  const bubble = () => screen.getByRole('group', { name: strings.selectedItem });

  it('with a tool chosen, a tap inside a big square puts the new item there; the square is not selected', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'sq', kind: 'rect', color: 'black', x: 0.02, y: 0.02, w: 0.96, h: 0.96 });
    const store = openPreview(doc);
    startTool(strings.toolTick);
    tap(document.querySelector('.mark-item') as HTMLElement, 250, 350);
    expect(marks(store).map((m) => m.kind)).toEqual(['rect', 'check']);
    expect(document.querySelector('.mark-item.selected[data-mark="sq"]')).toBeNull();
  });

  it('with no tool chosen, a tap on the square selects it (as before)', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'sq', kind: 'rect', color: 'black', x: 0.02, y: 0.02, w: 0.96, h: 0.96 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    tap(document.querySelector('.mark-item') as HTMLElement, 250, 350);
    expect(marks(store)).toHaveLength(1);
    expect(document.querySelector('.mark-item.selected[data-mark="sq"]')).not.toBeNull();
  });

  it('Wpisz: tap the page, type, Wstaw → the text sits where you tapped', () => {
    const store = openPreview();
    startTool(strings.toolWrite);
    tap(layer(), 100, 140);
    const box = screen.getByRole('textbox', { name: strings.writeTitle });
    fireEvent.change(box, { target: { value: 'Jan Kowalski' } });
    fireEvent.click(screen.getByRole('button', { name: strings.writeInsert }));
    const m = marks(store)[0] as { kind: string; text: string; color: string; size: number; x: number; y: number };
    expect(m).toMatchObject({ kind: 'text', text: 'Jan Kowalski', color: 'black', size: 2 });
    expect(m.x).toBeCloseTo(0.2);
    expect(m.y).toBeCloseTo(0.2);
    // shown on the page in the preview (and on its miniature behind it)
    expect(within(screen.getByRole('dialog', { name: strings.preview(1) })).getByText('Jan Kowalski')).toBeTruthy();
  });

  it('phone: the click that follows the tap lands on the backdrop of the new sheet and does not close it', () => {
    openPreview();
    startTool(strings.toolWrite);
    tap(layer(), 100, 140);
    // the phone sends a click right after the finger lifts; the sheet is under the finger by then
    fireEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(screen.getByRole('textbox', { name: strings.writeTitle })).toBeTruthy();
    // a real tap outside the sheet still closes it
    const backdrop = document.querySelector('.sheet-backdrop')!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole('textbox', { name: strings.writeTitle })).toBeNull();
  });

  it('Ptaszek in red: a tap puts a red tick centred on the finger', () => {
    const store = openPreview();
    startTool(strings.toolTick);
    fireEvent.click(screen.getByRole('button', { name: strings.inkRed }));
    tap(layer(), 250, 350);
    const m = marks(store)[0] as { kind: string; color: string; x: number; w: number };
    expect(m).toMatchObject({ kind: 'check', color: 'red' });
    expect(m.x + m.w / 2).toBeCloseTo(0.5);
  });

  it('more inks: a green cross, a purple text colour is remembered', () => {
    const store = openPreview();
    startTool(strings.toolCross);
    fireEvent.click(screen.getByRole('button', { name: strings.inkGreen }));
    tap(layer(), 250, 350);
    expect(marks(store)[0]).toMatchObject({ kind: 'cross', color: 'green' });
    fireEvent.click(screen.getByRole('button', { name: strings.inkPurple }));
    expect(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('edit-style'))!)!).ink).toBe('purple');
  });

  it('Krzyżyk puts a cross', () => {
    const store = openPreview();
    startTool(strings.toolCross);
    tap(layer(), 250, 350);
    expect(marks(store)[0]).toMatchObject({ kind: 'cross' });
  });

  it('a new item comes without handles; touching it shows them, touching the page hides them', () => {
    const store = openPreview();
    startTool(strings.toolTick);
    tap(layer(), 250, 350);
    expect(document.querySelector('.mark-item.selected')).toBeNull();
    tap(document.querySelector(`[data-mark="${marks(store)[0].id}"]`)!, 250, 350);
    expect(document.querySelector('.mark-item.selected')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings.toolTick })); // tool off
    tap(layer(), 50, 600);
    expect(document.querySelector('.mark-item.selected')).toBeNull();
  });

  it('the bubble over a selected item: colour, size, duplicate, remove', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'k1', kind: 'check', color: 'black', x: 0.1, y: 0.1, w: 0.05, h: 0.04 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    expect(screen.queryByRole('group', { name: strings.selectedItem })).toBeNull();
    tap(document.querySelector('[data-mark="k1"]')!, 60, 80);
    // colour and size each open a row of choices in the bubble
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.changeColor }));
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.inkGreen }));
    expect(marks(store)[0]).toMatchObject({ color: 'green' });
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.changeSize }));
    expect(within(bubble()).queryByRole('button', { name: strings.inkGreen })).toBeNull();
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.sizeLarge }));
    expect((marks(store)[0] as { w: number }).w).toBeCloseTo(0.07);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.duplicate }));
    expect(marks(store)).toHaveLength(2);
    const [a, b] = marks(store) as Array<{ id: string; x: number; color: string }>;
    expect(b.id).not.toBe(a.id);
    expect(b.x).toBeCloseTo(a.x + 0.03);
    expect(b.color).toBe('green');
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.removeMark }));
    expect(marks(store)).toHaveLength(1);
    expect(screen.queryByRole('group', { name: strings.selectedItem })).toBeNull();
  });

  it('a cover in the bubble offers black and white only', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'c1', kind: 'cover', color: 'black', x: 0.1, y: 0.1, w: 0.3, h: 0.1 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    tap(document.querySelector('[data-mark="c1"]')!, 60, 80);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.changeColor }));
    expect(within(bubble()).queryByRole('button', { name: strings.inkRed })).toBeNull();
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.coverWhite }));
    expect(marks(store)[0]).toMatchObject({ color: 'white' });
  });

  it('"Więcej" shows the rarer tools as tiles; picking one starts it and folds the tiles; "Więcej" stays lit', () => {
    openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const more = screen.getByRole('button', { name: strings.toolsMore });
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const tiles = screen.getByRole('group', { name: strings.toolsMore });
    expect(
      within(tiles)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([strings.toolHighlight, strings.toolShapes, strings.groupHide, strings.stampTool, strings.qrTool]);
    fireEvent.click(within(tiles).getByRole('button', { name: strings.toolShapes }));
    expect(screen.queryByRole('group', { name: strings.toolsMore })).toBeNull();
    expect(screen.getByRole('button', { name: strings.toolArrow }).getAttribute('aria-pressed')).toBe('true');
    expect(more.getAttribute('aria-pressed')).toBe('true');
  });

  it('one row of tools; a group shows its kinds above, tapping it again puts the tool away, and it remembers the last kind', () => {
    openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const row = document.querySelector('.edit-strip') as HTMLElement;
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      strings.toolWrite,
      strings.toolMarks,
      strings.groupDraw,
      strings.sign,
      strings.toolsMore,
    ]);
    const marksBtn = within(row).getByRole('button', { name: strings.toolMarks });
    fireEvent.click(marksBtn);
    expect(screen.getByRole('button', { name: strings.toolTick }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: strings.toolCross }));
    fireEvent.click(marksBtn); // put away
    expect(marksBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: strings.toolCross })).toBeNull();
    fireEvent.click(marksBtn); // back with the last kind
    expect(screen.getByRole('button', { name: strings.toolCross }).getAttribute('aria-pressed')).toBe('true');
  });

  it('the tool panel folds away and comes back; the tool stays on', () => {
    const store = openPreview();
    startTool(strings.toolTick);
    fireEvent.click(screen.getByRole('button', { name: strings.toolsHide }));
    expect(screen.queryByRole('button', { name: strings.toolTick })).toBeNull();
    tap(layer(), 250, 350);
    expect(marks(store)[0]).toMatchObject({ kind: 'check' });
    fireEvent.click(screen.getByRole('button', { name: strings.toolsShow }));
    expect(screen.getByRole('button', { name: strings.toolTick }).getAttribute('aria-pressed')).toBe('true');
  });

  it("Data writes today's date with one tap", () => {
    const store = openPreview();
    startTool(strings.toolDate);
    tap(layer(), 100, 100);
    expect(marks(store)[0]).toMatchObject({ kind: 'text', text: new Date().toLocaleDateString('pl') });
  });

  it('a text on the page: tap to select, tap again to change it (one undo step)', () => {
    const doc = addMark(docWithFlags(1), 'p1', {
      id: 't1',
      kind: 'text',
      text: 'Jan',
      color: 'blue',
      size: 2,
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.03,
    });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const item = document.querySelector('[data-mark="t1"]') as HTMLElement;
    tap(item, 60, 80);
    tap(item, 60, 80);
    const box = screen.getByRole('textbox', { name: strings.writeTitle }) as HTMLTextAreaElement;
    expect(box.value).toBe('Jan');
    fireEvent.change(box, { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: strings.writeInsert }));
    expect(marks(store)[0]).toMatchObject({ text: 'Anna', color: 'blue' });
    act(() => store.undo());
    expect(marks(store)[0]).toMatchObject({ text: 'Jan' });
  });

  it('choosing a colour while a tick is selected recolours it', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'k1', kind: 'check', color: 'black', x: 0.1, y: 0.1, w: 0.05, h: 0.04 });
    const store = openPreview(doc);
    startTool(strings.toolTick);
    tap(document.querySelector('[data-mark="k1"]')!, 60, 80);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.changeColor }));
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.inkBlue }));
    expect(marks(store)[0]).toMatchObject({ color: 'blue' });
  });

  const drag = (el: Element, pts: Array<[number, number]>) => {
    fireEvent.pointerDown(el, { clientX: pts[0][0], clientY: pts[0][1], pointerId: 1 });
    for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 });
    const [x, y] = pts[pts.length - 1];
    fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });
  };

  it('Pióro: a finger line becomes one pen stroke in the chosen ink (one undo step)', () => {
    const store = openPreview();
    startTool(strings.toolPen);
    fireEvent.click(screen.getByRole('button', { name: strings.inkBlue }));
    drag(layer(), [
      [50, 70],
      [100, 140],
      [150, 70],
      [200, 140],
    ]);
    const m = marks(store)[0] as { kind: string; color: string; points: number[] };
    expect(m).toMatchObject({ kind: 'pen', color: 'blue' });
    expect(m.points.slice(0, 2)).toEqual([0.1, 0.1]);
    expect(m.points.length).toBeGreaterThanOrEqual(6); // the zigzag keeps its bends
    act(() => store.undo());
    expect(marks(store)).toHaveLength(0);
  });

  it('Zakreślacz is yellow until another highlighter colour is chosen', () => {
    const store = openPreview();
    startTool(strings.toolHighlight);
    drag(layer(), [
      [50, 70],
      [300, 70],
    ]);
    fireEvent.click(screen.getByRole('button', { name: strings.hlPink }));
    drag(layer(), [
      [50, 140],
      [300, 140],
    ]);
    expect(marks(store).map((m) => [m.kind, m.color])).toEqual([
      ['highlight', 'yellow'],
      ['highlight', 'pink'],
    ]);
  });

  it('Strzałka goes from where the finger started to where it ended (even up and to the left)', () => {
    const store = openPreview();
    startTool(strings.toolArrow);
    drag(layer(), [
      [300, 420],
      [100, 140],
    ]);
    const m = marks(store)[0] as { kind: string; x: number; y: number; w: number; h: number };
    expect(m.kind).toBe('arrow');
    expect(m.x).toBeCloseTo(0.6);
    expect(m.y).toBeCloseTo(0.6);
    expect(m.w).toBeCloseTo(-0.4);
    expect(m.h).toBeCloseTo(-0.4);
  });

  it('Prostokąt and Kółko are dragged corner to corner; a tap draws nothing', () => {
    const store = openPreview();
    startTool(strings.toolRect);
    drag(layer(), [
      [300, 420],
      [100, 140],
    ]);
    tap(layer(), 50, 50);
    fireEvent.click(screen.getByRole('button', { name: strings.toolEllipse }));
    drag(layer(), [
      [50, 70],
      [250, 210],
    ]);
    const [r, e] = marks(store) as Array<{ kind: string; x: number; y: number; w: number; h: number }>;
    expect(marks(store)).toHaveLength(2);
    expect(r.kind).toBe('rect');
    expect(r.x).toBeCloseTo(0.2);
    expect(r.w).toBeCloseTo(0.4);
    expect(e.kind).toBe('ellipse');
    expect(e.h).toBeCloseTo(0.2);
  });

  it('a pen stroke can be selected and moved; all its points move', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'k', kind: 'pen', color: 'black', points: [0.2, 0.2, 0.4, 0.3] });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    drag(document.querySelector('[data-mark="k"]')!, [
      [150, 175],
      [200, 245],
    ]); // +0.1, +0.1
    const m = marks(store)[0] as { points: number[] };
    m.points.forEach((v, i) => expect(v).toBeCloseTo([0.3, 0.3, 0.5, 0.4][i]));
  });

  it('dragging the tip of a selected arrow changes where it points', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'a', kind: 'arrow', color: 'black', x: 0.2, y: 0.2, w: 0.2, h: 0 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    tap(document.querySelector('[data-mark="a"]')!, 150, 140);
    drag(document.querySelector('[data-handle="end"]')!, [
      [200, 140],
      [200, 280],
    ]); // tip down by 0.2
    expect(marks(store)[0]).toMatchObject({ x: 0.2, y: 0.2, w: 0.2 });
    expect((marks(store)[0] as { h: number }).h).toBeCloseTo(0.2);
  });

  it('miniatures show drawings', () => {
    fakeLayout();
    const doc = addMark(docWithFlags(1), 'p1', { id: 'k', kind: 'pen', color: 'black', points: [0.2, 0.2, 0.4, 0.3] });
    const store = createAppStore(fakeDeps());
    store.load(doc, [source]);
    render(<App store={store} />);
    expect(document.querySelector('.thumb-box polyline[data-kind="pen"]')).toBeTruthy();
  });

  it('miniatures show written text', () => {
    fakeLayout();
    const doc = addMark(docWithFlags(1), 'p1', {
      id: 't1',
      kind: 'text',
      text: 'Zażółć',
      color: 'black',
      size: 2,
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.03,
    });
    const store = createAppStore(fakeDeps());
    store.load(doc, [source]);
    render(<App store={store} />);
    expect(document.querySelector('.thumb-box')!.textContent).toContain('Zażółć');
  });
});

describe('Edytuj: gumka, grubość, na wszystkie strony, podpis, powiększanie', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const layer = () => document.querySelector('.mark-layer') as HTMLElement;
  const drag = (el: Element, pts: Array<[number, number]>, pointerId = 1) => {
    fireEvent.pointerDown(el, { clientX: pts[0][0], clientY: pts[0][1], pointerId });
    for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId });
    const [x, y] = pts[pts.length - 1];
    fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId });
  };
  const tap = (el: Element, x: number, y: number) => drag(el, [[x, y]]);
  const draw = () => {
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    openGroup(strings.groupDraw);
  };
  const bubble = () => screen.getByRole('group', { name: strings.selectedItem });

  it('Gumka rubs out the drawings the finger passes over, in one undo step; text stays', () => {
    let doc = addMark(docWithFlags(1), 'p1', { id: 'a', kind: 'pen', color: 'black', points: [0.1, 0.5, 0.9, 0.5] });
    doc = addMark(doc, 'p1', { id: 'b', kind: 'highlight', color: 'yellow', points: [0.1, 0.7, 0.9, 0.7] });
    doc = addMark(doc, 'p1', { id: 'c', kind: 'pen', color: 'red', points: [0.1, 0.1, 0.3, 0.1] });
    doc = addMark(doc, 'p1', { id: 't', kind: 'text', text: 'Jan', color: 'black', size: 2, x: 0.45, y: 0.55, w: 0.1, h: 0.03 });
    const store = openPreview(doc);
    draw();
    fireEvent.click(screen.getByRole('button', { name: strings.toolEraser }));
    drag(layer(), [
      [250, 300],
      [250, 360],
      [250, 400],
      [250, 500],
    ]); // down across y 0.5 and 0.7
    expect(marks(store).map((m) => m.id)).toEqual(['c', 't']);
    act(() => store.undo());
    expect(marks(store)).toHaveLength(4);
  });

  it('Pióro has a thickness; a thick line is stored as width 3 and a selected line can be made thinner', () => {
    const store = openPreview();
    draw();
    fireEvent.click(screen.getByRole('button', { name: strings.toolPen }));
    fireEvent.click(screen.getByRole('button', { name: strings.sizeLarge }));
    drag(layer(), [
      [100, 100],
      [200, 150],
      [300, 120],
    ]);
    expect(marks(store)[0]).toMatchObject({ kind: 'pen', width: 3 });
    fireEvent.click(screen.getByRole('button', { name: strings.groupDraw })); // tool off
    tap(document.querySelector(`[data-mark="${marks(store)[0].id}"]`)!, 200, 140);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.changeSize }));
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.sizeSmall }));
    expect(marks(store)[0]).toMatchObject({ width: 1 });
  });

  it('"Na wszystkie strony" copies the item to every other page in the same place, in one undo step', () => {
    const doc = addMark(docWithFlags(3), 'p1', {
      id: 'd',
      kind: 'text',
      text: '21.11.2026',
      color: 'blue',
      size: 2,
      x: 0.6,
      y: 0.9,
      w: 0.2,
      h: 0.03,
    });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    tap(document.querySelector('[data-mark="d"]')!, 350, 640);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.moreOptions }));
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.onAllPages }));
    const pages = store.getState().doc.pages;
    expect(pages.map((p) => p.marks?.length ?? 0)).toEqual([1, 1, 1]);
    expect(pages[2].marks![0]).toMatchObject({ text: '21.11.2026', x: 0.6, y: 0.9, color: 'blue' });
    expect(pages[2].marks![0].id).not.toBe('d');
    act(() => store.undo());
    expect(store.getState().doc.pages.map((p) => p.marks?.length ?? 0)).toEqual([1, 0, 0]);
  });

  it('a signature in Edytuj: handles only when touched; its bubble duplicates it and puts it on all pages', () => {
    const doc = docWithFlags(2);
    const store = openPreview(doc);
    act(() => store.addStamp('p1', { id: 's1', src: 'data:image/png;base64,AA', x: 0.5, y: 0.7, w: 0.3, h: 0.1 }));
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const stamp = document.querySelector('.stamp') as HTMLElement;
    expect(stamp.classList.contains('quiet')).toBe(true);
    expect(document.querySelector('.stamp-rotate')).toBeNull();
    tap(stamp, 300, 520);
    expect(document.querySelector('.stamp-rotate')).not.toBeNull();
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.duplicate }));
    expect(store.getState().doc.pages[0].stamps).toHaveLength(2);
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.moreOptions }));
    fireEvent.click(within(bubble()).getByRole('button', { name: strings.onAllPages }));
    expect(store.getState().doc.pages[1].stamps).toHaveLength(1);
  });

  it('dragging a corner dot with a finger shows a magnifier of the page under it; a mouse does not', async () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'r', kind: 'rect', color: 'red', x: 0.2, y: 0.4, w: 0.3, h: 0.2 });
    openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    const item = document.querySelector('[data-mark="r"]') as HTMLElement;
    tap(item, 150, 320);
    const corner = document.querySelector('.mark-item.selected .mark-handle.se') as HTMLElement;
    const t = { pointerId: 3, pointerType: 'touch' };
    fireEvent.pointerDown(corner, { ...t, clientX: 250, clientY: 420 });
    fireEvent.pointerMove(corner, { ...t, clientX: 270, clientY: 440 });
    // drawn on the next screen frame
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    const loupe = document.querySelector('.loupe') as HTMLElement;
    expect(loupe).not.toBeNull();
    fireEvent.pointerUp(corner, { ...t, clientX: 270, clientY: 440 });
    expect(document.querySelector('.loupe')).toBeNull();

    const m = { pointerId: 4, pointerType: 'mouse' };
    fireEvent.pointerDown(corner, { ...m, clientX: 270, clientY: 440 });
    fireEvent.pointerMove(corner, { ...m, clientX: 290, clientY: 460 });
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(document.querySelector('.loupe')).toBeNull();
    fireEvent.pointerUp(corner, { ...m, clientX: 290, clientY: 460 });
  });

  it('a tiny tick is marked small, so its corner dots sit further out', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'k', kind: 'check', color: 'black', x: 0.1, y: 0.1, w: 0.05, h: 0.035 });
    openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    expect(document.querySelector('[data-mark="k"]')!.classList.contains('small')).toBe(true);
  });

  it('two fingers zoom the page in and nothing is drawn; "Pomniejsz" brings it back', () => {
    const store = openPreview();
    draw();
    fireEvent.click(screen.getByRole('button', { name: strings.toolPen }));
    const l = layer();
    const t = { pointerType: 'touch' };
    fireEvent.pointerDown(l, { clientX: 200, clientY: 300, pointerId: 1, ...t });
    fireEvent.pointerMove(l, { clientX: 205, clientY: 305, pointerId: 1, ...t });
    fireEvent.pointerDown(l, { clientX: 300, clientY: 300, pointerId: 2, ...t });
    fireEvent.pointerMove(l, { clientX: 150, clientY: 300, pointerId: 1, ...t });
    fireEvent.pointerMove(l, { clientX: 350, clientY: 300, pointerId: 2, ...t });
    fireEvent.pointerUp(l, { clientX: 150, clientY: 300, pointerId: 1, ...t });
    fireEvent.pointerUp(l, { clientX: 350, clientY: 300, pointerId: 2, ...t });
    expect(marks(store)).toHaveLength(0);
    const zoomed = document.querySelector('.preview-zoom') as HTMLElement;
    expect(zoomed.style.transform).toMatch(/scale\(2/);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(strings.zoomOut) }));
    expect((document.querySelector('.preview-zoom') as HTMLElement).style.transform).toBe('');
  });
});
