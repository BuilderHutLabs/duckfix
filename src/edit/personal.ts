/**
 * "Ukryj dane osobowe": finding personal data in the recognised text of a page, so it can be covered.
 * Works on lines of words with their boxes (pixels of the page image); a number written in groups
 * ("PL61 1090 1014 …", "601 234 567") spans several words and gets one box over all of them.
 */

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrLine {
  words: OcrWord[];
}
export type PersonalKind = 'account' | 'pesel' | 'id' | 'phone' | 'email';
export interface PersonalHit {
  kind: PersonalKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** PESEL check digit (weights 1 3 7 9 1 3 7 9 1 3). */
export function validPesel(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = w.reduce((s, k, i) => s + k * Number(d[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(d[10]);
}

/** Patterns in the order they are tried; a later one never takes text an earlier one took. */
const PATTERNS: Array<{ kind: PersonalKind; re: RegExp; check?(m: string): boolean }> = [
  // bank account: 26 digits, usually in groups of four, optionally with PL in front
  { kind: 'account', re: /(?<![\dA-Z])(?:PL ?)?\d{2}(?: ?\d{4}){6}(?!\d)/gi },
  { kind: 'pesel', re: /(?<!\d)\d{11}(?!\d)/g, check: validPesel },
  // ID card (ABC 123456) and passport (AB 1234567)
  { kind: 'id', re: /(?<![A-Za-z0-9])(?:[A-Z]{3} ?\d{6}|[A-Z]{2} ?\d{7})(?!\d)/g },
  // mobile 601 234 567 / +48 601-234-567, landline 22 123 45 67
  { kind: 'phone', re: /(?<![\d+])(?:\+48[ -]?)?(?:\d{3}[ -]?\d{3}[ -]?\d{3}|\d{2}[ -]\d{3}[ -]\d{2}[ -]\d{2})(?![\d])/g },
  // e-mail; text recognition often reads the @ as Q, © or ®, so those count before a known ending
  {
    kind: 'email',
    re: /[\w.+-]+(?:@|[Q©®](?=[\w-]+(?:\.[\w-]+)*\.(?:pl|com|eu|net|org|de|es|info|io|me|uk)\b))[\w-]+(?:\.[\w-]+)+/g,
  },
];

export function findPersonal(lines: OcrLine[]): PersonalHit[] {
  const hits: PersonalHit[] = [];
  for (const line of lines) {
    // the line as text, remembering where each word starts and ends
    let text = '';
    const spans = line.words.map((w) => {
      if (text) text += ' ';
      const start = text.length;
      text += w.text;
      return { start, end: text.length, w };
    });
    const taken: Array<[number, number]> = [];
    const found: Array<{ at: number; hit: PersonalHit }> = [];
    for (const { kind, re, check } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const s = m.index!;
        const e = s + m[0].length;
        if (check && !check(m[0].replace(/\D/g, ''))) continue;
        if (taken.some(([a, b]) => s < b && e > a)) continue;
        const words = spans.filter((p) => p.start < e && p.end > s).map((p) => p.w.bbox);
        if (!words.length) continue;
        taken.push([s, e]);
        found.push({
          at: s,
          hit: {
            kind,
            x0: Math.min(...words.map((b) => b.x0)),
            y0: Math.min(...words.map((b) => b.y0)),
            x1: Math.max(...words.map((b) => b.x1)),
            y1: Math.max(...words.map((b) => b.y1)),
          },
        });
      }
    }
    hits.push(...found.sort((a, b) => a.at - b.at).map((f) => f.hit));
  }
  return hits;
}
