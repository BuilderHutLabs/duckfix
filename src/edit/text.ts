import type { InkColor } from '../model/document';

/** Ink colours of "Edytuj" (text, ticks, pen). */
export const INK: Record<InkColor, string> = { black: '#111111', blue: '#1a3a9c', red: '#c62828' };

/** Font height as a fraction of the page height for the three sizes. */
export const FONT_FRAC = { 1: 0.016, 2: 0.024, 3: 0.036 } as const;
/** Tick / cross side as a fraction of the page width for the three sizes. */
export const TICK_FRAC = { 1: 0.035, 2: 0.05, 3: 0.07 } as const;
export const LINE_HEIGHT = 1.25;
/** Rough width of a character in sans-serif, in font heights (used for the starting box only). */
const CHAR_W = 0.55;

export type MarkSize = 1 | 2 | 3;

const lineCount = (text: string) => Math.max(1, text.split('\n').length);

/** Font height (fraction of the page height) of a text mark: its box height drives it, so resizing scales the text. */
export function fontFrac(m: { text: string; h: number }): number {
  return m.h / (lineCount(m.text) * LINE_HEIGHT);
}

/** Box of a new text mark with its top-left at the tap, moved inside the page. */
export function newTextBox(
  text: string,
  size: MarkSize,
  at: { x: number; y: number },
  pageW: number,
  pageH: number,
  /** Width in px of a line at a font size in px (real measuring on screen); a rough estimate without it. */
  measure: (line: string, fontPx: number) => number = (line, px) => line.length * CHAR_W * px,
): { x: number; y: number; w: number; h: number } {
  const lines = text.split('\n');
  const f = FONT_FRAC[size];
  const h = Math.min(1, lines.length * LINE_HEIGHT * f);
  const widest = Math.max(1, ...lines.map((l) => measure(l, f * pageH)));
  const w = Math.min(1, (widest * 1.04) / pageW);
  return { x: Math.min(Math.max(0, at.x), 1 - w), y: Math.min(Math.max(0, at.y), 1 - h), w, h };
}

/** Box of a new tick or cross: square on the page, centred on the tap. */
export function tickBox(size: MarkSize, at: { x: number; y: number }, pageW: number, pageH: number) {
  const w = TICK_FRAC[size];
  const h = (w * pageW) / pageH;
  return { x: Math.min(Math.max(0, at.x - w / 2), 1 - w), y: Math.min(Math.max(0, at.y - h / 2), 1 - h), w, h };
}

/** Today's date the way people write it in the app's language (21.11.2026, 11/21/2026, …). */
export function todayText(lang: string, now = new Date()): string {
  return now.toLocaleDateString(lang === 'en' ? 'en-US' : lang);
}

/** Tick and cross as polylines in the unit box (0..1), shared by the screen and the saved page. */
export const TICK_PATH: Array<Array<[number, number]>> = [[[0.12, 0.55], [0.4, 0.82], [0.9, 0.18]]];
export const CROSS_PATH: Array<Array<[number, number]>> = [
  [[0.15, 0.15], [0.85, 0.85]],
  [[0.85, 0.15], [0.15, 0.85]],
];
