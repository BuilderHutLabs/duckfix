import { useEffect, useState } from 'react';
import { storageKey } from '../config';
import { pl, type Strings } from './pl';
import { en } from './en';
import { de } from './de';
import { es } from './es';

export type Lang = 'pl' | 'en' | 'de' | 'es';
export const LANGS: Lang[] = ['pl', 'en', 'de', 'es'];
export const DICTS: Record<Lang, Strings> = { pl, en, de, es };
/** Shown in the picker in their own language, never translated. */
export const LANG_NAMES: Record<Lang, string> = { pl: 'Polski', en: 'English', de: 'Deutsch', es: 'Español' };
export const LANG_KEY = storageKey('duckfix-lang');

/**
 * The texts of the current language. One shared object, updated in place by setLanguage, so every
 * `import { strings }` keeps working; components re-render through useLanguage (App keys its tree).
 */
export const strings: Strings = { ...pl };
let current: Lang = 'pl';
const listeners = new Set<(l: Lang) => void>();

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** First supported language of the phone's list (e.g. 'de-AT' → 'de'); English otherwise. */
export function detectLanguage(navLangs: readonly string[]): Lang {
  for (const l of navLangs) {
    const base = l.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export function loadLanguage(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* private mode */
  }
  const nav = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return detectLanguage(nav.filter(Boolean));
}

/** File size for people: "1,2 MB" / "420 kB" (decimal units, like phones show). */
export function formatSize(bytes: number, lang: Lang = current): string {
  if (bytes >= 1_000_000) {
    const mb = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1_000_000);
    return `${mb} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

export function currentLanguage(): Lang {
  return current;
}

export function setLanguage(l: Lang, save = false): void {
  Object.assign(strings, DICTS[l]);
  current = l;
  document.documentElement.lang = l;
  if (save) {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* private mode: lasts for this visit */
    }
  }
  listeners.forEach((f) => f(l));
}

export function useLanguage(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState(current);
  useEffect(() => {
    listeners.add(setLang);
    return () => {
      listeners.delete(setLang);
    };
  }, []);
  return [lang, (l) => setLanguage(l, true)];
}
