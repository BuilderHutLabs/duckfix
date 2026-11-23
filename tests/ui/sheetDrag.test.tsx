import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { useBackdropClose } from '../../src/ui/backdrop';

/** A bottom sheet as the app makes them: backdrop, grabber, title, a scrolling body. */
function Sheet({ onClose }: { onClose(): void }) {
  const backdrop = useBackdropClose(onClose);
  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet" role="dialog" aria-label="Okno">
        <div className="sheet-grabber" data-testid="grab" />
        <h2 className="sheet-title">Okno</h2>
        <p data-testid="body">treść</p>
        <input aria-label="pole" />
        <button type="button">Przycisk</button>
      </div>
    </div>
  );
}

function App() {
  const [open, setOpen] = useState(true);
  return open ? <Sheet onClose={() => setOpen(false)} /> : <p>zamknięte</p>;
}

const touch = (el: Element, type: 'touchStart' | 'touchMove' | 'touchEnd', y: number, x = 100) => {
  const t = [{ clientX: x, clientY: y, identifier: 1, target: el }];
  fireEvent[type](el, { touches: type === 'touchEnd' ? [] : t, changedTouches: t });
};

/** A finger from y0 down to y1 (in steps), lifted there. */
function drag(el: Element, y0: number, y1: number, x = 100) {
  touch(el, 'touchStart', y0, x);
  // a calm finger: 20 px every 50 ms (a flick is a separate case)
  for (let y = y0 + 20; y < y1; y += 20) {
    vi.advanceTimersByTime(50);
    touch(el, 'touchMove', y, x);
  }
  vi.advanceTimersByTime(50);
  touch(el, 'touchMove', y1, x);
  touch(el, 'touchEnd', y1, x);
}

describe('closing a bottom sheet by dragging it down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error back to jsdom's own
    delete HTMLElement.prototype.offsetHeight;
  });

  it('a drag down from the top of the sheet (grabber or title) far enough closes it', () => {
    render(<App />);
    drag(screen.getByTestId('grab'), 100, 300);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText('zamknięte')).toBeTruthy();
  });

  it('a short drag puts the sheet back; it stays open', () => {
    render(<App />);
    drag(screen.getByRole('heading', { name: 'Okno' }), 100, 160, 100);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('dialog', { name: 'Okno' })).toBeTruthy();
    expect((screen.getByRole('dialog', { name: 'Okno' }) as HTMLElement).style.transform).toBe('');
  });

  it('from the middle it closes only when the sheet is scrolled to the top (else it is ordinary scrolling)', () => {
    render(<App />);
    const sheet = screen.getByRole('dialog', { name: 'Okno' });
    sheet.scrollTop = 120;
    Object.defineProperty(sheet, 'scrollTop', { configurable: true, get: () => 120 });
    drag(screen.getByTestId('body'), 100, 400);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('dialog', { name: 'Okno' })).toBeTruthy();
    Object.defineProperty(sheet, 'scrollTop', { configurable: true, get: () => 0 });
    drag(screen.getByTestId('body'), 100, 400);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText('zamknięte')).toBeTruthy();
  });

  it('a drag that starts in a text field does not move the sheet', () => {
    render(<App />);
    drag(screen.getByRole('textbox', { name: 'pole' }), 100, 400);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('dialog', { name: 'Okno' })).toBeTruthy();
  });

  it('a quick flick down closes it even when short', () => {
    render(<App />);
    const grab = screen.getByTestId('grab');
    touch(grab, 'touchStart', 100);
    vi.advanceTimersByTime(20);
    touch(grab, 'touchMove', 130);
    vi.advanceTimersByTime(20);
    touch(grab, 'touchMove', 170);
    touch(grab, 'touchEnd', 170);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText('zamknięte')).toBeTruthy();
  });

  it('sideways moves are left alone', () => {
    render(<App />);
    const grab = screen.getByTestId('grab');
    touch(grab, 'touchStart', 100, 100);
    touch(grab, 'touchMove', 110, 180);
    touch(grab, 'touchMove', 300, 200);
    touch(grab, 'touchEnd', 300, 200);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('dialog', { name: 'Okno' })).toBeTruthy();
  });
});
