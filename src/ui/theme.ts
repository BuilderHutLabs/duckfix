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
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(loadTheme()));
}
