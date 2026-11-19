import { act, fireEvent, render } from '@testing-library/react';
import { DuckLogo } from '../../src/ui/DuckLogo';
import { strings } from '../../src/ui/strings';

describe('DuckLogo', () => {
  it('quacks on start: beak animates and the "Kwa kwa!" bubble shows, then it calms down', () => {
    vi.useFakeTimers();
    const { container } = render(<DuckLogo autoplay />);
    const logo = () => container.querySelector('.duck')!;
    expect(logo().classList.contains('quacking')).toBe(true);
    expect(container.querySelector('.duck-beak-lower')).not.toBeNull();
    expect(container.querySelector('.duck-bubble')?.textContent).toBe(strings.quack);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(logo().classList.contains('quacking')).toBe(false);
    expect(container.querySelector('.duck-bubble')).toBeNull();
    vi.useRealTimers();
  });

  it('stays still without autoplay and quacks again when tapped', () => {
    vi.useFakeTimers();
    const { container } = render(<DuckLogo autoplay={false} />);
    const logo = () => container.querySelector('.duck')!;
    expect(logo().classList.contains('quacking')).toBe(false);
    fireEvent.click(logo());
    expect(logo().classList.contains('quacking')).toBe(true);
    expect(container.querySelector('.duck-bubble')?.textContent).toBe(strings.quack);
    vi.useRealTimers();
  });
});
