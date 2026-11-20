/**
 * Build namespace. The live app builds without it; the test link (duckfix-v2) sets
 * VITE_STORAGE_NS so its settings and last document never mix with the live app's,
 * which shares the same origin (builderhutlabs.github.io).
 */
export const STORAGE_NS: string = import.meta.env.VITE_STORAGE_NS ?? '';

export function storageKey(key: string): string {
  return STORAGE_NS ? `${STORAGE_NS}:${key}` : key;
}

/** IndexedDB database holding the last open document. */
export const IDB_NAME = STORAGE_NS ? `${STORAGE_NS}-wduck` : 'wduck';
