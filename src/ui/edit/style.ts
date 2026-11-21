import { storageKey } from '../../config';
import { HIGHLIGHT_COLORS, INK_COLORS, type HighlightColor, type InkColor } from '../../model/document';
import type { MarkSize } from '../../edit/text';

export interface EditStyle {
  ink: InkColor;
  size: MarkSize;
  highlight: HighlightColor;
}

const KEY = storageKey('duckfix-edit-style');
const DEFAULT: EditStyle = { ink: 'black', size: 2, highlight: 'yellow' };

/** Colour and size of Wpisz / ✓ / ✗ / Data, remembered on this phone. */
export function loadEditStyle(): EditStyle {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EditStyle> | null;
    return {
      ink: INK_COLORS.includes(v?.ink as InkColor) ? (v!.ink as InkColor) : 'black',
      size: v?.size === 1 || v?.size === 3 ? v.size : 2,
      highlight: HIGHLIGHT_COLORS.includes(v?.highlight as HighlightColor) ? (v!.highlight as HighlightColor) : 'yellow',
    };
  } catch {
    return DEFAULT;
  }
}

export function saveEditStyle(s: EditStyle): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}
