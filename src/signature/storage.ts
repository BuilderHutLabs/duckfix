import { storageKey } from '../config';

/** The user's signature, kept only on this phone: transparent PNG + width/height ratio. */
export interface SavedSignature {
  src: string;
  aspect: number;
}

const KEY = storageKey('duckfix-signature');

export function loadSignature(): SavedSignature | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedSignature | null;
    return v && typeof v.src === 'string' && v.src.startsWith('data:image/png') && v.aspect > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveSignature(s: SavedSignature): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode / full storage: it works for this visit only
  }
}

export function clearSignature(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
