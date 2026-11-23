import qrcode from 'qrcode-generator';

/** "Kod QR": a link or text, a bank transfer (Polish standard) or a business card. */
export type QrKind = 'text' | 'pay' | 'card';

export interface PayData {
  name: string;
  account: string;
  /** "123,45" or "123.45" zł; empty = no amount. */
  amount: string;
  title: string;
  /** Optional, 10 digits. */
  nip: string;
}

export interface CardData {
  name: string;
  phone: string;
  email: string;
  org: string;
}

/** Polish letters written plainly: ą → a, Ł → L (bank apps read the transfer code reliably then). */
export function plain(s: string): string {
  return s.replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** A Polish account number (NRB): 26 digits, typed with or without spaces and "PL"; null when not. */
export function normalizeAccount(v: string): string | null {
  const d = v.replace(/^\s*PL/i, '').replace(/[\s-]/g, '');
  return /^\d{26}$/.test(d) ? d : null;
}

/** Amount in grosze, up to 9 999,99 zł (6 digits); 0 for empty; null when wrong. */
function grosze(v: string): number | null {
  const t = v.replace(/\s/g, '').replace(',', '.');
  if (!t) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const g = Math.round(Number(t) * 100);
  return g <= 999_999 ? g : null;
}

/**
 * The transfer code of the Polish banks (ZBP): nine fields split by "|" — NIP, country, account,
 * amount in grosze (6 digits), name (20 signs), title (32 signs) and three spare ones. Null when a
 * field is wrong or missing.
 */
export function payPayload(d: PayData): string | null {
  const account = normalizeAccount(d.account);
  const amount = grosze(d.amount);
  const nip = d.nip.replace(/[\s-]/g, '');
  const name = plain(d.name.trim()).slice(0, 20);
  if (!account || amount === null || !name || (nip && !/^\d{10}$/.test(nip))) return null;
  const title = plain(d.title.trim()).replace(/\|/g, '/').slice(0, 32);
  return [nip, 'PL', account, String(amount).padStart(6, '0'), name.replace(/\|/g, '/'), title, '', '', ''].join('|');
}

/** A business card (vCard 3.0); null without a name, or without both phone and e-mail. */
export function cardPayload(d: CardData): string | null {
  const name = d.name.trim();
  const phone = d.phone.replace(/[^\d+]/g, '');
  const email = d.email.trim();
  if (!name || (!phone && !email)) return null;
  const parts = name.split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : '';
  const esc = (v: string) => v.replace(/([\\;,])/g, '\\$1');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(last)};${esc(parts.join(' '))};;;`,
    `FN:${esc(name)}`,
    ...(d.org.trim() ? [`ORG:${esc(d.org.trim())}`] : []),
    ...(phone ? [`TEL:${phone}`] : []),
    ...(email ? [`EMAIL:${email}`] : []),
    'END:VCARD',
  ].join('\n');
}

/** UTF-8 bytes of a text as one character each (the QR library reads a byte per character). */
export function utf8Binary(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join('');
}

/** The code's modules, row by row (true = dark); medium error correction, size chosen to fit. */
export function qrMatrix(text: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(utf8Binary(text), 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}
