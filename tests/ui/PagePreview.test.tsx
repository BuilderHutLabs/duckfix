import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

vi.mock('../../src/imaging/render', () => ({
  renderPage: vi.fn(() => new Promise(() => {})),
  releaseCanvas: vi.fn((c: { width: number }) => {
    c.width = 0;
  }),
  getPdf: vi.fn(),
  forgetPdf: vi.fn(async () => {}),
}));

import { App } from '../../src/ui/App';
import { PagePreview } from '../../src/ui/PagePreview';
import { isHoldRelease } from '../../src/ui/ReviewGrid';
import { AppStoreProvider, createAppStore, type AppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import type { Doc } from '../../src/model/document';
import { releaseCanvas } from '../../src/imaging/render';
import { docWithFlags, fakeDeps, page, source } from './fixtures';

function setup(doc: Doc): AppStore {
  const store = createAppStore(fakeDeps());
  store.load(doc, [source]);
  return store;
}

const dialog = (n: number) => screen.queryByRole('dialog', { name: strings.preview(n) });

/** A fake canvas that survives toBlob. */
function fakeCanvas() {
  return { width: 100, height: 100, toBlob: (cb: (b: Blob) => void) => cb(new Blob(['x'])) } as unknown as HTMLCanvasElement;
}

let urlCount = 0;
let now = 1_000_000;
/** Moves the clock past the ghost-click guard of a freshly opened preview. */
const settle = () => {
  now += 500;
};
beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  urlCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:full-${++urlCount}`);
  URL.revokeObjectURL = vi.fn();
  vi.mocked(releaseCanvas).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isHoldRelease', () => {
  it('drag end on the same page with a small delta opens the preview; a real move reorders', () => {
    expect(isHoldRelease('p1', 'p1', { x: 3, y: -4 })).toBe(true);
    expect(isHoldRelease('p1', 'p1', { x: 12, y: 0 })).toBe(false);
    expect(isHoldRelease('p1', 'p2', { x: 1, y: 1 })).toBe(false);
  });
});

describe('page preview', () => {
  it('shows the page number, rotates through history and closes on ✕ and Escape', () => {
    const store = setup(docWithFlags(3));
    render(<App store={store} />);
    act(() => store.openPreview('p2'));
    const dlg = screen.getByRole('dialog', { name: 'Podgląd: strona 2' });
    settle();
    fireEvent.click(within(dlg).getByRole('button', { name: strings.rotate }));
    expect(store.getState().doc.pages[1].rotation).toBe(90);
    act(() => store.undo());
    expect(store.getState().doc.pages[1].rotation).toBe(0);
    fireEvent.click(within(dlg).getByRole('button', { name: strings.close }));
    expect(dialog(2)).toBeNull();
    act(() => store.openPreview('p2'));
    expect(dialog(2)).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog(2)).toBeNull();
  });

  it('a finger swipe sideways walks the pages; a short or up-down move does not', () => {
    const store = setup(docWithFlags(3));
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1', 'p2', 'p3']} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    const swipe = (x0: number, y0: number, x1: number, y1: number) => {
      const stage = document.querySelector('.preview-stage') as HTMLElement;
      fireEvent.pointerDown(stage, { clientX: x0, clientY: y0, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(stage, { clientX: x1, clientY: y1, pointerId: 1, isPrimary: true });
    };
    swipe(300, 300, 280, 300); // too short
    expect(dialog(1)).not.toBeNull();
    swipe(300, 300, 200, 500); // mostly down
    expect(dialog(1)).not.toBeNull();
    swipe(300, 300, 150, 310); // to the left: next page
    expect(dialog(2)).not.toBeNull();
    swipe(100, 300, 300, 290); // to the right: back
    expect(dialog(1)).not.toBeNull();
    swipe(100, 300, 300, 290); // nothing before the first page
    expect(dialog(1)).not.toBeNull();
    expect(screen.getByText('1 / 3')).toBeTruthy();
  });

  it('‹ › walk the visible pages and are disabled at the ends', () => {
    const store = setup(docWithFlags(3));
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1', 'p3']} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    const prev = screen.getByRole('button', { name: strings.previousPage });
    const next = screen.getByRole('button', { name: strings.nextPage });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    settle();
    fireEvent.click(next);
    expect(dialog(3)).not.toBeNull();
    expect((screen.getByRole('button', { name: strings.nextPage }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(dialog(1)).not.toBeNull();
  });

  it('the preview image uses the thumbnail angle', async () => {
    const doc: Doc = {
      pages: [page('p1', { rotation: 90, source: { kind: 'pdf', fileId: 'f1', pageIndex: 0, baseRotation: 90, hasTextLayer: false } })],
    };
    const store = setup(doc);
    const fake = vi.fn(async () => fakeCanvas());
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1']} render={fake} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    const img = await screen.findByRole('presentation');
    expect(img.style.transform).toContain('rotate(180deg)');
  });

  it('a late render for a page already left is discarded and canvases are released', async () => {
    const store = setup(docWithFlags(2));
    const resolvers: Record<string, (c: HTMLCanvasElement) => void> = {};
    const canvases: HTMLCanvasElement[] = [];
    const fake = vi.fn(
      (_s: unknown, ref: { pageIndex: number }) =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolvers[`r${Object.keys(resolvers).length}`] = (c) => {
            canvases.push(c);
            resolve(c);
          };
          void ref;
        }),
    );
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1', 'p2']} render={fake as never} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    act(() => store.openPreview('p2'));
    // p1's render (r0) finishes after the user left p1
    await act(async () => resolvers.r0(fakeCanvas()));
    expect(screen.queryByRole('presentation')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await act(async () => resolvers.r1(fakeCanvas()));
    const img = screen.getByRole('presentation') as HTMLImageElement;
    expect(img.src).toBe('blob:full-1');
    expect(canvases.map((c) => c.width)).toEqual([0, 0]);
    expect(releaseCanvas).toHaveBeenCalledTimes(2);
    act(() => store.closePreview());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:full-1');
  });
});

describe('preview robustness', () => {
  it('reopening a page does not show the revoked URL', async () => {
    const store = setup(docWithFlags(1));
    const fake = vi.fn(async () => fakeCanvas());
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1']} render={fake} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    const first = ((await screen.findByRole('presentation')) as HTMLImageElement).src;
    act(() => store.closePreview());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
    fake.mockImplementation(() => new Promise(() => {}));
    act(() => store.openPreview('p1'));
    const img = screen.queryByRole('presentation') as HTMLImageElement | null;
    expect(img?.src ?? null).not.toBe(first);
  });

  it('the placeholder thumbnail appears when it finishes during the preview', () => {
    const store = setup(docWithFlags(1));
    let state: { status: 'ready'; url: string } | undefined;
    const subs = new Set<() => void>();
    const cache = {
      get: () => state,
      subscribe: (_id: string, cb: () => void) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    } as never;
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1']} render={() => new Promise(() => {})} cache={cache} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    expect(screen.queryByRole('presentation')).toBeNull();
    state = { status: 'ready', url: 'blob:thumb' };
    act(() => subs.forEach((cb) => cb()));
    expect((screen.getByRole('presentation') as HTMLImageElement).src).toBe('blob:thumb');
  });

  it('ignores the ghost click right after opening', () => {
    const store = setup(docWithFlags(2));
    render(
      <AppStoreProvider store={store}>
        <PagePreview pageIds={['p1', 'p2']} />
      </AppStoreProvider>,
    );
    act(() => store.openPreview('p1'));
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    fireEvent.click(screen.getByRole('button', { name: strings.nextPage }));
    expect(dialog(1)).not.toBeNull();
    settle();
    fireEvent.click(screen.getByRole('button', { name: strings.close }));
    expect(dialog(1)).toBeNull();
  });
});

describe('mouse hold on a thumb', () => {
  const thumb = () => screen.getByRole('button', { name: /^Strona 2\b/ });

  it('opening the preview from a hold does not rotate the page', () => {
    vi.useFakeTimers();
    const store = setup(docWithFlags(3));
    render(<App store={store} />);
    fireEvent.pointerDown(thumb(), { pointerType: 'mouse', button: 0 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(store.getState().previewId).toBe('p2');
    fireEvent.pointerUp(thumb(), { pointerType: 'mouse' });
    fireEvent.click(thumb());
    expect(store.getState().doc.pages[1].rotation).toBe(0);
  });

  it('a quick press still rotates once', () => {
    vi.useFakeTimers();
    const store = setup(docWithFlags(3));
    render(<App store={store} />);
    fireEvent.pointerDown(thumb(), { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(thumb(), { pointerType: 'mouse' });
    fireEvent.click(thumb());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(store.getState().previewId).toBeNull();
    expect(store.getState().doc.pages[1].rotation).toBe(90);
  });
});
