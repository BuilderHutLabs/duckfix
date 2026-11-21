import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { fakeDeps } from './fixtures';

describe('duck helper on first start', () => {
  beforeEach(() => localStorage.clear());

  it('shows 3 tips one after another, then never again', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const tour = () => screen.queryByRole('dialog', { name: strings.tourTitle });
    expect(tour()).not.toBeNull();
    expect(screen.getByText(strings.tourSteps[0])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.tourNext }));
    expect(screen.getByText(strings.tourSteps[1])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.tourNext }));
    expect(screen.getByText(strings.tourSteps[2])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: strings.tourDone }));
    expect(tour()).toBeNull();
    cleanup();
    render(<App store={createAppStore(fakeDeps())} />);
    expect(tour()).toBeNull();
  });

  it('"Pomiń" closes it for good', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    fireEvent.click(screen.getByRole('button', { name: strings.tourSkip }));
    expect(screen.queryByRole('dialog', { name: strings.tourTitle })).toBeNull();
    cleanup();
    render(<App store={createAppStore(fakeDeps())} />);
    expect(screen.queryByRole('dialog', { name: strings.tourTitle })).toBeNull();
  });
});
