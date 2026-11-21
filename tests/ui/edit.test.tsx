import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/ui/App';
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
    left: 0, top: 0, width: 500, height: 700, right: 500, bottom: 700, x: 0, y: 0, toJSON() {},
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

describe('Edytuj', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the top bar has Tekst, Edytuj, Obróć; Edytuj shows the tools and Gotowe', () => {
    openPreview();
    const preview = screen.getByRole('dialog', { name: strings.preview(1) });
    expect(within(preview).queryByRole('button', { name: strings.sign })).toBeNull(); // moved into the tools
    fireEvent.click(within(preview).getByRole('button', { name: strings.edit }));
    expect(within(preview).getByRole('button', { name: strings.cover })).toBeTruthy();
    expect(within(preview).getByRole('button', { name: strings.sign })).toBeTruthy();
    fireEvent.click(within(preview).getByRole('button', { name: strings.editDone }));
    expect(within(preview).queryByRole('button', { name: strings.cover })).toBeNull();
  });

  it('Zasłoń: dragging over the page adds a black cover there (one undo step)', () => {
    const store = openPreview();
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
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
    fireEvent.click(screen.getByRole('button', { name: strings.pageCrop }));
    fireEvent.click(screen.getByRole('button', { name: strings.pageCropAll }));
    expect(store.getState().doc.pages.map((p) => p.crop?.w)).toEqual([0.8, 0.8, 0.8]);
    fireEvent.click(screen.getByRole('button', { name: strings.pageCropNone }));
    expect(store.getState().doc.pages.map((p) => p.crop?.w)).toEqual([undefined, 0.8, 0.8]);
  });

  it('outside Kadruj the preview shows only the cropped part', () => {
    openPreview(setCrop(docWithFlags(1), ['p1'], { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }));
    const stage = document.querySelector('.preview-stage') as HTMLElement;
    // page box 500×700 at the origin: inset top 140, right 200, bottom 210, left 50
    expect(stage.style.clipPath).toBe('inset(140px 200px 210px 50px)');
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
  const startTool = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    fireEvent.click(screen.getByRole('button', { name }));
  };

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

  it('Ptaszek in red: a tap puts a red tick centred on the finger', () => {
    const store = openPreview();
    startTool(strings.toolTick);
    fireEvent.click(screen.getByRole('button', { name: strings.inkRed }));
    tap(layer(), 250, 350);
    const m = marks(store)[0] as { kind: string; color: string; x: number; w: number };
    expect(m).toMatchObject({ kind: 'check', color: 'red' });
    expect(m.x + m.w / 2).toBeCloseTo(0.5);
  });

  it('Krzyżyk puts a cross', () => {
    const store = openPreview();
    startTool(strings.toolCross);
    tap(layer(), 250, 350);
    expect(marks(store)[0]).toMatchObject({ kind: 'cross' });
  });

  it('Data writes today\'s date with one tap', () => {
    const store = openPreview();
    startTool(strings.toolDate);
    tap(layer(), 100, 100);
    expect(marks(store)[0]).toMatchObject({ kind: 'text', text: new Date().toLocaleDateString('pl') });
  });

  it('a text on the page: tap to select, tap again to change it (one undo step)', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 't1', kind: 'text', text: 'Jan', color: 'blue', size: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.03 });
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
    fireEvent.click(screen.getByRole('button', { name: strings.inkBlue }));
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
    drag(layer(), [[50, 70], [100, 140], [150, 70], [200, 140]]);
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
    drag(layer(), [[50, 70], [300, 70]]);
    fireEvent.click(screen.getByRole('button', { name: strings.hlPink }));
    drag(layer(), [[50, 140], [300, 140]]);
    expect(marks(store).map((m) => [m.kind, m.color])).toEqual([['highlight', 'yellow'], ['highlight', 'pink']]);
  });

  it('Strzałka goes from where the finger started to where it ended (even up and to the left)', () => {
    const store = openPreview();
    startTool(strings.toolArrow);
    drag(layer(), [[300, 420], [100, 140]]);
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
    drag(layer(), [[300, 420], [100, 140]]);
    tap(layer(), 50, 50);
    fireEvent.click(screen.getByRole('button', { name: strings.toolEllipse }));
    drag(layer(), [[50, 70], [250, 210]]);
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
    drag(document.querySelector('[data-mark="k"]')!, [[150, 175], [200, 245]]); // +0.1, +0.1
    const m = marks(store)[0] as { points: number[] };
    m.points.forEach((v, i) => expect(v).toBeCloseTo([0.3, 0.3, 0.5, 0.4][i]));
  });

  it('dragging the tip of a selected arrow changes where it points', () => {
    const doc = addMark(docWithFlags(1), 'p1', { id: 'a', kind: 'arrow', color: 'black', x: 0.2, y: 0.2, w: 0.2, h: 0 });
    const store = openPreview(doc);
    fireEvent.click(screen.getByRole('button', { name: strings.edit }));
    tap(document.querySelector('[data-mark="a"]')!, 150, 140);
    drag(document.querySelector('[data-handle="end"]')!, [[200, 140], [200, 280]]); // tip down by 0.2
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
    const doc = addMark(docWithFlags(1), 'p1', { id: 't1', kind: 'text', text: 'Zażółć', color: 'black', size: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.03 });
    const store = createAppStore(fakeDeps());
    store.load(doc, [source]);
    render(<App store={store} />);
    expect(document.querySelector('.thumb-box')!.textContent).toContain('Zażółć');
  });
});
