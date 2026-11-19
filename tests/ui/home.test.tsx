import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { fakeDeps } from './fixtures';

describe('Home screen', () => {
  it('shows the icon, title, description, steps and the open button', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    expect(screen.getByRole('heading', { name: strings.appName })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings.open })).toBeTruthy();
    expect(
      screen.getByText('Automatycznie obraca i prostuje krzywe skany PDF.'),
    ).toBeTruthy();
    for (const step of ['1. Otwórz', '2. Sprawdź', '3. Zapisz']) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    // the duck logo (animated SVG) replaces the static icon image
    expect(document.querySelector('.home .duck svg')).not.toBeNull();
  });

  it('settings popover closes on outside pointerdown and on Escape', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    const gear = () => screen.getByRole('button', { name: strings.settings });
    fireEvent.click(gear());
    expect(screen.getByRole('checkbox', { name: strings.deskew })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('checkbox', { name: strings.deskew })).toBeNull();
    fireEvent.click(gear());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('checkbox', { name: strings.deskew })).toBeNull();
  });
});
