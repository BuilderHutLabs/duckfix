import { storageKey } from '../config';

/** Choices in the save sheet, remembered between saves. */
export interface ExportOptions {
  /** "Mniejszy plik": every page becomes a lighter JPEG. */
  compress: boolean;
  /** "Tekst do wyszukiwania": an invisible OCR text layer on image pages. */
  ocr: boolean;
}

export const EXPORT_KEY = storageKey('duckfix-export');
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { compress: false, ocr: false };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadExportOptions(storage: StorageLike | null): ExportOptions {
  try {
    const v = JSON.parse(storage?.getItem(EXPORT_KEY) ?? 'null') as Partial<ExportOptions> | null;
    return { compress: v?.compress === true, ocr: v?.ocr === true };
  } catch {
    return { ...DEFAULT_EXPORT_OPTIONS };
  }
}

export function saveExportOptions(storage: StorageLike | null, o: ExportOptions): void {
  try {
    storage?.setItem(EXPORT_KEY, JSON.stringify(o));
  } catch {
    // private mode: the choice lasts for this visit only
  }
}
