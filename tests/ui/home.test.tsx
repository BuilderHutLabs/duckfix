import { render, screen } from '@testing-library/react';
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
      screen.getByText('Obraca i prostuje skany PDF. Wszystko zostaje na Twoim urządzeniu.'),
    ).toBeTruthy();
    for (const step of ['1. Otwórz', '2. Sprawdź', '3. Zapisz']) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    const src = document.querySelector('img.home-icon')?.getAttribute('src') ?? '';
    expect(src.endsWith('icons/icon-192.png')).toBe(true);
    expect(src).toBe(import.meta.env.BASE_URL + 'icons/icon-192.png');
  });
});
