import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { PALETTE_KEY, THEME_KEY, applyTheme, initTheme, loadPalette, loadTheme } from '../../src/ui/theme';
import { fakeDeps } from './fixtures';

const themeAttr = () => document.documentElement.getAttribute('data-theme');
const metaColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('theme choice', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.head.innerHTML = '<meta name="theme-color" content="#f2f2f7">';
  });

  it('defaults to auto (follows the system) when nothing is saved', () => {
    expect(loadTheme()).toBe('auto');
    localStorage.setItem(THEME_KEY, 'nonsense');
    expect(loadTheme()).toBe('auto');
  });

  it('settings offer Automatyczny / Jasny / Ciemny; the choice applies at once and is remembered', () => {
    render(<App store={createAppStore(fakeDeps())} />);
    fireEvent.click(screen.getByRole('button', { name: strings.settings }));
    const option = (name: string) => screen.getByRole('button', { name });
    expect(option(strings.themeAuto).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(option(strings.themeDark));
    expect(themeAttr()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(metaColor()).toBe('#000000');
    expect(option(strings.themeDark).getAttribute('aria-pressed')).toBe('true');
    // choosing a theme keeps the popover open
    expect(option(strings.themeLight)).toBeTruthy();

    fireEvent.click(option(strings.themeLight));
    expect(themeAttr()).toBe('light');
    expect(metaColor()).toBe('#f2f2f7');

    fireEvent.click(option(strings.themeAuto));
    expect(themeAttr()).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('applyTheme survives storage that throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => applyTheme('dark', true)).not.toThrow();
    expect(themeAttr()).toBe('dark');
    spy.mockRestore();
  });

  it('colour sets: Ciepły by default; a chosen set applies at once, is remembered and restored at start', () => {
    expect(loadPalette()).toBe('warm');
    localStorage.setItem(PALETTE_KEY, 'nonsense');
    expect(loadPalette()).toBe('warm');
    localStorage.clear();

    render(<App store={createAppStore(fakeDeps())} />);
    fireEvent.click(screen.getByRole('button', { name: strings.settings }));
    const swatch = (name: string) => screen.getByRole('button', { name });
    expect(swatch(strings.paletteWarm).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-palette')).toBeNull();

    fireEvent.click(swatch(strings.paletteMint));
    expect(document.documentElement.getAttribute('data-palette')).toBe('mint');
    expect(localStorage.getItem(PALETTE_KEY)).toBe('mint');
    expect(swatch(strings.paletteMint).getAttribute('aria-pressed')).toBe('true');

    document.documentElement.removeAttribute('data-palette');
    initTheme();
    expect(document.documentElement.getAttribute('data-palette')).toBe('mint');

    fireEvent.click(swatch(strings.paletteWarm));
    expect(document.documentElement.getAttribute('data-palette')).toBeNull();
    expect(localStorage.getItem(PALETTE_KEY)).toBeNull();
  });
});

describe('language choice', () => {
  afterEach(async () => {
    const { setLanguage } = await import('../../src/i18n');
    setLanguage('pl');
    localStorage.clear();
  });

  it('settings list the four languages by their own names; English applies at once', async () => {
    const { en } = await import('../../src/i18n/en');
    render(<App store={createAppStore(fakeDeps())} />);
    fireEvent.click(screen.getByRole('button', { name: strings.settings }));
    for (const name of ['Polski', 'English', 'Deutsch', 'Español']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: en.settings })).toBeTruthy();
    // options built from the texts follow the language too (the tree re-renders, so reopen Settings)
    fireEvent.click(screen.getByRole('button', { name: en.settings }));
    expect(screen.getByRole('button', { name: en.themeDark })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.paletteMint })).toBeTruthy();
  });
});
