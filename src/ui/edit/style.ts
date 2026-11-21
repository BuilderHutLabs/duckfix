import { storageKey } from '../../config';
import type { InkColor } from '../../model/document';
import type { MarkSize } from '../../edit/text';

export interface EditStyle {
  ink: InkColor;
  size: MarkSize;
}

const KEY = storageKey('duckfix-edit-style');
const DEFAULT: EditStyle = { ink: 'black', size: 2 };

/** Colour and size of Wpisz / ✓ / ✗ / Data, remembered on this phone. */
export function loadEditStyle(): EditStyle {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EditStyle> | null;
    return {
      ink: v?.ink === 'blue' || v?.ink === 'red' ? v.ink : 'black',
      size: v?.size === 1 || v?.size === 3 ? v.size : 2,
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
