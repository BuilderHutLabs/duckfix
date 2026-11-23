import { storageKey } from '../config';

/** Options of the save window that can be shown or hidden ("Okno zapisu" in the settings). */
export const SAVE_FIELDS = ['format', 'size', 'pages', 'ocr', 'split', 'watermark', 'password'] as const;
export type SaveField = (typeof SAVE_FIELDS)[number];
export type SaveFields = Record<SaveField, boolean>;

const KEY = storageKey('duckfix-save-fields');
/** Every option shown at first; each can be hidden in "Okno zapisu". */
export const DEFAULT_SAVE_FIELDS: SaveFields = {
  format: true,
  size: true,
  pages: true,
  ocr: true,
  split: true,
  watermark: true,
  password: true,
};

export function loadSaveFields(): SaveFields {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SaveFields> | null;
    if (!v || typeof v !== 'object') return { ...DEFAULT_SAVE_FIELDS };
    return Object.fromEntries(SAVE_FIELDS.map((f) => [f, typeof v[f] === 'boolean' ? v[f] : DEFAULT_SAVE_FIELDS[f]])) as SaveFields;
  } catch {
    return { ...DEFAULT_SAVE_FIELDS };
  }
}

export function saveSaveFields(f: SaveFields): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* private mode: only for this visit */
  }
}
