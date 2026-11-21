/**
 * Pages typed by the user ("2-4, 7", page numbers from 1) as 0-based indexes, in the typed order,
 * without repeats. Empty text means every page; a page that does not exist or other text gives null.
 */
export function parsePageRange(text: string, count: number): number[] | null {
  const t = text.trim();
  if (!t) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  const add = (i: number) => !out.includes(i) && out.push(i);
  for (const part of t.split(/[,;\s]+(?![-–—])(?<![-–—]\s*)/)) {
    if (!part) continue;
    const m = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < 1 || a > count || b > count) return null;
    const step = a <= b ? 1 : -1;
    for (let p = a; p !== b + step; p += step) add(p - 1);
  }
  return out.length ? out : null;
}
