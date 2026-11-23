import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { storageKey } from '../../src/config';
import { fakeDeps } from './fixtures';

const touch = (el: Element, type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => {
  const t = [{ clientX: 150, clientY: y, identifier: 1, target: el }];
  fireEvent[type](el, { touches: type === 'touchEnd' ? [] : t, changedTouches: t });
};

describe('home screen panel: pulled down, it springs back', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(storageKey('duckfix-tour2'), '1');
  });
  afterEach(() => vi.useRealTimers());

  it('follows the finger down, ever harder, and goes back up when let go', () => {
    vi.useFakeTimers();
    render(<App store={createAppStore(fakeDeps())} />);
    const panel = document.querySelector('.home-panel') as HTMLElement;
    touch(panel, 'touchStart', 400);
    touch(panel, 'touchMove', 450);
    touch(panel, 'touchMove', 700);
    const moved = parseFloat(panel.style.getPropertyValue('--pull')) || 0;
    expect(moved).toBeGreaterThan(20);
    expect(moved).toBeLessThan(300); // harder and harder: less than the finger went
    touch(panel, 'touchEnd', 700);
    act(() => vi.advanceTimersByTime(600));
    expect(panel.style.getPropertyValue('--pull')).toBe('');
  });

  it('a pull that starts on a button does not press it', () => {
    vi.useFakeTimers();
    const open = vi.fn();
    render(<App store={createAppStore(fakeDeps())} />);
    const btn = screen.getByRole('button', { name: strings.homeOpen });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(open);
    touch(btn, 'touchStart', 400);
    touch(btn, 'touchMove', 520);
    touch(btn, 'touchEnd', 520);
    fireEvent.click(btn); // the click the phone sends after the finger lifts
    expect(click).not.toHaveBeenCalled();
  });

  it('moving up does nothing', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const panel = document.querySelector('.home-panel') as HTMLElement;
    touch(panel, 'touchStart', 400);
    touch(panel, 'touchMove', 300);
    expect(panel.style.getPropertyValue('--pull')).toBe('');
    touch(panel, 'touchEnd', 300);
  });
});
