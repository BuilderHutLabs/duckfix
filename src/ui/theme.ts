import { useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';

export const THEME_KEY = 'wduck-theme';
const BAR_COLOR = { light: '#f2f2f7', dark: '#000000' } as const;

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Sets `data-theme` on <html> (none = follow the system) and the browser bar colour; optionally remembers it. */
export function applyTheme(choice: ThemeChoice, save = false): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const dark = choice === 'dark' || (choice === 'auto' && systemDark());
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR_COLOR.dark : BAR_COLOR.light);
  if (!save) return;
  try {
    if (choice === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // private mode: the choice lasts for this visit only
  }
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [theme, setTheme] = useState(loadTheme);
  return [
    theme,
    (c) => {
      applyTheme(c, true);
      setTheme(c);
    },
  ];
}

/** Applies the saved choice at start-up and keeps the bar colour in step with the system in auto mode. */
export function initTheme(): void {
  applyTheme(loadTheme());
  applyPalette(loadPalette());
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(loadTheme()));
}

/* ---------- colour set ("Kolor"): accent, main buttons and the home glow ---------- */

export type PaletteChoice = 'warm' | 'blue' | 'mint' | 'lavender';

export const PALETTE_KEY = 'duckfix-palette';
const PALETTES: PaletteChoice[] = ['warm', 'blue', 'mint', 'lavender'];

export function loadPalette(): PaletteChoice {
  try {
    const v = localStorage.getItem(PALETTE_KEY) as PaletteChoice | null;
    return v && PALETTES.includes(v) ? v : 'warm';
  } catch {
    return 'warm';
  }
}

/** Sets `data-palette` on <html> (none = Ciepły, the default); optionally remembers it. */
export function applyPalette(choice: PaletteChoice, save = false): void {
  const root = document.documentElement;
  if (choice === 'warm') root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', choice);
  if (!save) return;
  try {
    if (choice === 'warm') localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, choice);
  } catch {
    // private mode: the choice lasts for this visit only
  }
}

export function usePalette(): [PaletteChoice, (c: PaletteChoice) => void] {
  const [palette, setPalette] = useState(loadPalette);
  return [
    palette,
    (c) => {
      applyPalette(c, true);
      setPalette(c);
    },
  ];
}
