import { storageKey } from '../config';

/** A full signature, short initials (parafka) for the corner of every page, or your own stamp (photo). */
export type SignatureKind = 'signature' | 'initials' | 'stamp';
const KINDS: SignatureKind[] = ['signature', 'initials', 'stamp'];

/** A signature kept only on this phone: transparent PNG + width/height ratio. */
export interface SavedSignature {
  src: string;
  aspect: number;
  id?: string;
  kind?: SignatureKind;
}
export type StoredSignature = Required<SavedSignature>;

const KEY = storageKey('duckfix-signatures');
/** The single signature of earlier versions. */
const OLD_KEY = storageKey('duckfix-signature');

const valid = (v: Partial<SavedSignature> | null): v is SavedSignature =>
  !!v && typeof v.src === 'string' && v.src.startsWith('data:image/png') && typeof v.aspect === 'number' && v.aspect > 0;

function write(list: StoredSignature[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // private mode / full storage: it works for this visit only
  }
}

/** All saved signatures and initials, newest first. */
export function loadSignatures(): StoredSignature[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Array<Partial<SavedSignature>>;
      return Array.isArray(list)
        ? list.filter(valid).map((s) => ({ ...s, id: s.id ?? crypto.randomUUID(), kind: s.kind && KINDS.includes(s.kind) ? s.kind : 'signature' }))
        : [];
    }
    // an earlier version kept one signature: keep it as the first of the list
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as Partial<SavedSignature> | null;
    if (valid(old)) {
      const list: StoredSignature[] = [{ src: old.src, aspect: old.aspect, id: crypto.randomUUID(), kind: 'signature' }];
      write(list);
      return list;
    }
  } catch {
    /* unreadable: nothing saved */
  }
  return [];
}

export function addSignature(s: SavedSignature, kind: SignatureKind): StoredSignature {
  const item: StoredSignature = { src: s.src, aspect: s.aspect, id: crypto.randomUUID(), kind };
  write([item, ...loadSignatures()]);
  return item;
}

export function removeSignature(id: string): void {
  write(loadSignatures().filter((s) => s.id !== id));
}
