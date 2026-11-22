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
