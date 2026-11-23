import { strings } from '../ui/strings';

/** Ready-made office stamps ("Pieczątka"). */
export const STAMP_KINDS = ['certified', 'copy', 'paid', 'received', 'filed'] as const;
export type StampKind = (typeof STAMP_KINDS)[number];

export const STAMP_INKS = ['red', 'blue'] as const;
export type StampInk = (typeof STAMP_INKS)[number];

/** One line of a stamp: its text and its size relative to the stamp's main line (1). */
export interface StampLine {
  text: string;
  size: number;
  kind?: 'sign';
}

/** Kinds that carry a date (it can be changed on a placed stamp). */
export const DATED: StampKind[] = ['certified', 'paid', 'received'];

/** "2026-11-22" (a date field's value) from a day, and back (local time). */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function fromIsoDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** "22.11.2026" */
export function stampDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** What a stamp says, line by line, on the given day. */
export function stampLines(kind: StampKind, day: Date = new Date()): StampLine[] {
  const date = stampDate(day);
  switch (kind) {
    case 'certified':
      return [
        ...strings.stampCertified.map((text) => ({ text, size: 0.62 })),
        { text: date, size: 0.5 },
        { text: strings.stampSignLine, size: 0.34, kind: 'sign' as const },
      ];
    case 'paid':
      return [
        { text: strings.stampPaid, size: 1 },
        { text: date, size: 0.5 },
      ];
    case 'received':
      return [
        { text: strings.stampReceived, size: 1 },
        { text: strings.stampOnDay(date), size: 0.5 },
      ];
    case 'copy':
      return [{ text: strings.stampCopy, size: 1 }];
    case 'filed':
      return [{ text: strings.stampFiled, size: 1 }];
  }
}
