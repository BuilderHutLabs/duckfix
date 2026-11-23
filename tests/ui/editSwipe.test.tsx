import { act, fireEvent, render, screen } from '@testing-library/react';
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

const back = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: null })));

function openEditor() {
  const store = createAppStore(fakeDeps());
  store.load(docWithFlags(1), [source]);
  render(<App store={store} />);
  act(() => store.openPreview('p1'));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the preview's ghost-click guard
  fireEvent.click(screen.getByRole('button', { name: strings.edit }));
  return store;
}

const panel = () => screen.getByRole('toolbar', { name: strings.edit });
const grip = () => panel().querySelector('.edit-grip') as HTMLElement;

const touch = (el: Element, type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => {
  const t = [{ clientX: 150, clientY: y, identifier: 1, target: el }];
  fireEvent[type](el, { touches: type === 'touchEnd' ? [] : t, changedTouches: t });
};
/** A calm finger from y0 to y1 on el. */
function swipe(el: Element, y0: number, y1: number) {
  touch(el, 'touchStart', y0);
  const step = y1 > y0 ? 20 : -20;
  for (let y = y0 + step; step > 0 ? y < y1 : y > y1; y += step) {
    act(() => vi.advanceTimersByTime(50));
    touch(el, 'touchMove', y);
  }
  touch(el, 'touchMove', y1);
  touch(el, 'touchEnd', y1);
  act(() => vi.advanceTimersByTime(300));
}

describe('editor tools: swipe down and Back put things away layer by layer', () => {
  beforeEach(() => {
    resetBackStack();
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 200 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // @ts-expect-error back to jsdom's own
    delete HTMLElement.prototype.offsetHeight;
  });

  it('swipe down: first the "Więcej" tiles go, then the chosen tool, then the panel folds; swipe up unfolds it', () => {
    openEditor();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fireEvent.click(screen.getByRole('button', { name: strings.toolWrite }));
    fireEvent.click(screen.getByRole('button', { name: strings.toolsMore }));
    expect(screen.getByRole('group', { name: strings.toolsMore })).toBeTruthy();
    swipe(grip(), 100, 260);
    expect(screen.queryByRole('group', { name: strings.toolsMore })).toBeNull();
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('true');
    swipe(grip(), 100, 260);
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('false');
    expect(panel().classList.contains('folded')).toBe(false);
    swipe(grip(), 100, 260);
    expect(panel().classList.contains('folded')).toBe(true);
    swipe(grip(), 260, 100);
    expect(panel().classList.contains('folded')).toBe(false);
  });

  it('a short swipe changes nothing; a swipe that starts on a colour does not move the panel', () => {
    openEditor();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fireEvent.click(screen.getByRole('button', { name: strings.toolWrite }));
    swipe(grip(), 100, 130);
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('true');
    swipe(screen.getByRole('button', { name: strings.inkRed }), 100, 300);
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Back: the "Więcej" tiles first, then the chosen tool, then the preview', () => {
    const store = openEditor();
    fireEvent.click(screen.getByRole('button', { name: strings.toolWrite }));
    fireEvent.click(screen.getByRole('button', { name: strings.toolsMore }));
    back();
    expect(screen.queryByRole('group', { name: strings.toolsMore })).toBeNull();
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('true');
    back();
    expect(screen.getByRole('button', { name: strings.toolWrite }).getAttribute('aria-pressed')).toBe('false');
    expect(store.getState().previewId).toBe('p1');
    back();
    expect(store.getState().previewId).toBeNull();
  });
});
