import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// Thumbnails never finish rendering in jsdom: keep them pending (no canvas, no object URLs).
vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn(),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

// PageThumb calls effectiveRotation once per render: count renders per page id
// (React.memo must skip thumbs whose page did not change).
const renderCounts = vi.hoisted(() => new Map<string, number>());
vi.mock('../../src/model/document', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/document')>();
  return {
    ...real,
    effectiveRotation: (p: Parameters<typeof real.effectiveRotation>[0]) => {
      renderCounts.set(p.id, (renderCounts.get(p.id) ?? 0) + 1);
      return real.effectiveRotation(p);
    },
  };
});

import { App } from '../../src/ui/App';
import type { PageAnalysis } from '../../src/pipeline/analyze';
import { createAppStore, type AppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { ImportError } from '../../src/import/errors';
import type { Doc } from '../../src/model/document';
import { docWithFlags, fakeDeps, source } from './fixtures';

function setup(doc: Doc, deps = fakeDeps()): AppStore {
  const store = createAppStore(deps);
  store.load(doc, [source]);
  render(<App store={store} />);
  return store;
}

const thumbs = () => screen.queryAllByRole('button', { name: /^Strona \d+/ });
const thumb = (n: number) => screen.getByRole('button', { name: new RegExp(`^Strona ${n}\\b`) });

describe('strings.toCheck (Polish plurals)', () => {
  it.each([
    [1, '1 strona do sprawdzenia'],
    [3, '3 strony do sprawdzenia'],
    [5, '5 stron do sprawdzenia'],
    [12, '12 stron do sprawdzenia'],
    [22, '22 strony do sprawdzenia'],
    [0, '0 stron do sprawdzenia'],
  ])('%i → %s', (n, text) => {
    expect(strings.toCheck(n)).toBe(text);
  });
});

describe('review grid', () => {
  it('tap on page 2 rotates it 90°, undo restores 0', () => {
    const store = setup(docWithFlags(3));
    fireEvent.click(thumb(2));
    expect(store.getState().doc.pages[1].rotation).toBe(90);
    expect(store.getState().doc.pages[0].rotation).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: strings.undo }));
    expect(store.getState().doc.pages[1].rotation).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: strings.redo }));
    expect(store.getState().doc.pages[1].rotation).toBe(90);
  });

  it('counts flagged pages and filters to them', () => {
    setup(docWithFlags(5, { 0: ['check-orientation'], 2: ['low-text'], 4: ['check-orientation'] }));
    expect(screen.getByText('3 strony do sprawdzenia')).toBeTruthy();
    expect(thumbs()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: strings.showOnlyFlagged }));
    expect(thumbs()).toHaveLength(3);
    expect(thumbs().map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual([
      'Strona 1',
      'Strona 3',
      'Strona 5',
    ]);
  });

  it('tapping a check-orientation page clears its flag from the counter', () => {
    setup(docWithFlags(5, { 0: ['check-orientation'], 2: ['low-text'], 4: ['check-orientation'] }));
    fireEvent.click(thumb(1));
    expect(screen.getByText('2 strony do sprawdzenia')).toBeTruthy();
  });

  it('tapping every flagged page (incl. low-text) brings the counter to 0', () => {
    setup(docWithFlags(3, { 0: ['check-orientation'], 2: ['low-text'] }));
    fireEvent.click(screen.getByRole('button', { name: strings.showOnlyFlagged }));
    fireEvent.click(thumb(1));
    fireEvent.click(thumb(3));
    // tapped pages stay in the filtered view so they can be turned further
    expect(thumbs()).toHaveLength(2);
    expect(screen.getByText('0 stron do sprawdzenia')).toBeTruthy();
    expect(screen.getByText(strings.nothingFlagged)).toBeTruthy();
  });

  it('auto-rotated icon only when analysis changed the orientation in the model frame', () => {
    const doc = docWithFlags(3);
    // p1: PDF /Rotate already upright → model 0, no icon; p2: turned by analysis; p3: not analyzed yet
    doc.pages[0] = { ...doc.pages[0], autoRotation: 0, source: { ...doc.pages[0].source, baseRotation: 90 } as never };
    doc.pages[1] = { ...doc.pages[1], autoRotation: 90, rotation: 90 };
    doc.pages[2] = { ...doc.pages[2], autoRotation: null, analyzed: false };
    setup(doc);
    expect(thumb(1).querySelector('.auto-icon')).toBeNull();
    expect(thumb(2).querySelector('.auto-icon')).not.toBeNull();
    expect(thumb(3).querySelector('.auto-icon')).toBeNull();
    expect(thumb(2).getAttribute('aria-label')).toContain(strings.autoRotated);
  });

  it('an analysis result re-renders only the affected thumbnail', () => {
    const doc = { pages: docWithFlags(4).pages.map((p) => ({ ...p, analyzed: false, autoRotation: null })) };
    let onResult: ((a: PageAnalysis) => void) | undefined;
    const deps = fakeDeps({
      analyzePages: vi.fn((_p, _d, cb) => {
        onResult = cb;
        return new Promise<void>(() => {});
      }),
    });
    const store = setup(doc, deps);
    return waitFor(() => expect(onResult).toBeDefined()).then(() => {
      renderCounts.clear();
      act(() => onResult!({ pageId: 'p3', rotation: 90, skewDeg: 0, flags: [], confidence: 5, ms: 1 }));
      expect(store.getState().doc.pages[2].rotation).toBe(90);
      expect([...renderCounts.keys()]).toEqual(['p3']);
    });
  });

  it('select mode: select 2 of 3, remove leaves 1 page; undo brings back 3', () => {
    const store = setup(docWithFlags(3));
    fireEvent.click(screen.getByRole('button', { name: strings.select }));
    fireEvent.click(thumb(1));
    fireEvent.click(thumb(3));
    expect(store.getState().doc.pages.every((p) => p.rotation === 0)).toBe(true); // taps select, not rotate
    expect(screen.getByText(strings.selectedCount(2))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.remove }));
    expect(store.getState().doc.pages.map((p) => p.id)).toEqual(['p2']);
    expect(thumbs()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: strings.undo }));
    expect(thumbs()).toHaveLength(3);
  });

  it('select mode: rotate rotates only the selected pages', () => {
    const store = setup(docWithFlags(3));
    fireEvent.click(screen.getByRole('button', { name: strings.select }));
    fireEvent.click(thumb(2));
    fireEvent.click(screen.getByRole('button', { name: strings.rotate }));
    expect(store.getState().doc.pages.map((p) => p.rotation)).toEqual([0, 90, 0]);
  });

  it('miniature transform is effective rotation + skew', () => {
    const doc = docWithFlags(1);
    doc.pages[0] = {
      ...doc.pages[0],
      source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 90, hasTextLayer: false },
      rotation: 180,
      skewDeg: 1.5,
    };
    setup(doc);
    const frame = thumb(1).querySelector('.thumb-frame') as HTMLElement;
    expect(frame.style.transform).toBe('rotate(271.5deg)');
  });
});

describe('home', () => {
  it('"Prostuj przekrzywienie" off → analyzePages called with deskew: false', async () => {
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    fireEvent.click(screen.getByRole('button', { name: strings.settings }));
    const toggle = screen.getByRole('checkbox', { name: strings.deskew }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'skan.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(deps.analyzePages).toHaveBeenCalled());
    expect(vi.mocked(deps.analyzePages).mock.calls[0][3]).toMatchObject({
      deskew: false,
      concurrency: 2,
      maxSide: 2000,
    });
    expect(deps.importFiles).toHaveBeenCalledWith([file]);
  });

  it('ImportError shows its Polish message and stays on home', async () => {
    const deps = fakeDeps({
      importFiles: vi.fn(async () => {
        throw new ImportError('encrypted');
      }),
    });
    render(<App store={createAppStore(deps)} />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf')] } });
    });
    expect(await screen.findByText(strings.errors.encrypted)).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.open })).toBeTruthy();
  });
});
