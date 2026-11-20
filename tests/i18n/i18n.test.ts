import { pl } from '../../src/i18n/pl';
import { en } from '../../src/i18n/en';
import { de } from '../../src/i18n/de';
import { es } from '../../src/i18n/es';
import { detectLanguage, loadLanguage, setLanguage, strings, LANG_KEY } from '../../src/i18n';

type Tree = Record<string, unknown>;

/** key paths of a dictionary, recursing into plain objects (arrays and functions are leaves) */
function keys(o: Tree, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v as Tree, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function leaves(o: Tree): unknown[] {
  return Object.values(o).flatMap((v) => (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v as Tree) : [v]));
}

describe('translations', () => {
  afterEach(() => {
    setLanguage('pl');
    localStorage.clear();
  });

  it.each([
    ['en', en],
    ['de', de],
    ['es', es],
  ])('%s has exactly the Polish keys', (_, dict) => {
    expect(keys(dict as unknown as Tree).sort()).toEqual(keys(pl as unknown as Tree).sort());
  });

  it.each([
    ['pl', pl],
    ['en', en],
    ['de', de],
    ['es', es],
  ])('%s has no empty texts and every text function answers', (_, dict) => {
    for (const v of leaves(dict as unknown as Tree)) {
      if (typeof v === 'string') expect(v.trim()).not.toBe('');
      else if (Array.isArray(v)) v.forEach((s) => expect(String(s).trim()).not.toBe(''));
      else if (typeof v === 'function') {
        for (const args of [[1], [3], [12], [1, 3]]) expect(String(v(...args)).trim()).not.toBe('');
      }
    }
  });

  it('picks the phone language, falling back to English', () => {
    expect(detectLanguage(['de-AT', 'en'])).toBe('de');
    expect(detectLanguage(['fr', 'es-MX'])).toBe('es');
    expect(detectLanguage(['fr'])).toBe('en');
    expect(detectLanguage(['pl-PL'])).toBe('pl');
    expect(detectLanguage([])).toBe('en');
  });

  it('a saved choice wins over the phone language', () => {
    localStorage.setItem(LANG_KEY, 'es');
    expect(loadLanguage()).toBe('es');
    localStorage.setItem(LANG_KEY, 'xx');
    expect(['pl', 'en', 'de', 'es']).toContain(loadLanguage());
  });

  it('switching language updates the shared strings and <html lang>', () => {
    setLanguage('de');
    expect(strings.save).toBe(de.save);
    expect(strings.toCheck(3)).toBe(de.toCheck(3));
    expect(document.documentElement.lang).toBe('de');
    setLanguage('pl', true);
    expect(strings.save).toBe(pl.save);
    expect(localStorage.getItem(LANG_KEY)).toBe('pl');
  });
});
