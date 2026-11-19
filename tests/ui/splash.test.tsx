import { act, render } from '@testing-library/react';
import { SPLASH_TOTAL_MS, Splash, isStandaloneLaunch } from '../../src/ui/Splash';
import { DuckLogo } from '../../src/ui/DuckLogo';

describe('launch splash', () => {
  it('is only for the installed app (not a browser tab)', () => {
    expect(isStandaloneLaunch()).toBe(false);
  });

  it('shows the duck centred, then finishes after about a second', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(<Splash onDone={onDone} />);
    expect(container.querySelector('.splash .duck-svg')).not.toBeNull();
    expect(document.body.classList.contains('splashing')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(SPLASH_TOTAL_MS - 50);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('splashing')).toBe(false);
    expect(SPLASH_TOTAL_MS).toBeGreaterThanOrEqual(900);
    expect(SPLASH_TOTAL_MS).toBeLessThanOrEqual(1300);
    vi.useRealTimers();
  });

  it('the home duck waits for the splash before it quacks', () => {
    vi.useFakeTimers();
    const { container } = render(<DuckLogo autoplay delayMs={1000} />);
    const quacking = () => container.querySelector('.duck')!.classList.contains('quacking');
    expect(quacking()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(quacking()).toBe(true);
    vi.useRealTimers();
  });
});
