import { storageKey } from '../config';

/** "Rozmiar pliku": full quality, or smaller until the file fits a limit. */
export type ExportSize = 'best' | 'mail' | 'small';
export const EXPORT_SIZES: ExportSize[] = ['best', 'mail', 'small'];
/** The limit of each size (bytes, the way sizes are shown: 1 MB = 1 000 000 B). */
export const SIZE_LIMIT: Record<ExportSize, number> = { best: Infinity, mail: 5_000_000, small: 1_000_000 };
/** Quality level the first try starts at (0 = full quality, see LEVELS in rasterize). */
export const SIZE_START: Record<ExportSize, number> = { best: 0, mail: 1, small: 2 };

/** Choices in the save sheet, remembered between saves. */
export interface ExportOptions {
  size: ExportSize;
  /** "Tekst do wyszukiwania": an invisible OCR text layer on image pages. */
  ocr: boolean;
  /** PDF, or every page as a JPG picture. */
  format: 'pdf' | 'jpg';
}

export const EXPORT_KEY = storageKey('duckfix-export');
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { size: 'best', ocr: false, format: 'pdf' };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadExportOptions(storage: StorageLike | null): ExportOptions {
  try {
    const v = JSON.parse(storage?.getItem(EXPORT_KEY) ?? 'null') as (Partial<ExportOptions> & { compress?: boolean }) | null;
    // "Mniejszy plik" of earlier versions: the mail size
    const size: ExportSize = v?.size && EXPORT_SIZES.includes(v.size) ? v.size : v?.compress === true ? 'mail' : 'best';
    return { size, ocr: v?.ocr === true, format: v?.format === 'jpg' ? 'jpg' : 'pdf' };
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
