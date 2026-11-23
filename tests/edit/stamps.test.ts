import { STAMP_KINDS, stampLines } from '../../src/edit/stamps';
import { extractStampInk } from '../../src/signature/extract';
import { strings } from '../../src/ui/strings';

const day = new Date(2026, 10, 22);

describe('ready-made stamps', () => {
  it('there are five: za zgodność z oryginałem, kopia, zapłacono, otrzymano, do akt', () => {
    expect(STAMP_KINDS).toEqual(['certified', 'copy', 'paid', 'received', 'filed']);
  });

  it('"Za zgodność z oryginałem" has the date and a place to sign under it', () => {
    const lines = stampLines('certified', day);
    expect(lines.map((l) => l.text)).toEqual([...strings.stampCertified, '22.11.2026', strings.stampSignLine]);
    expect(lines[0].size).toBeGreaterThan(lines[2].size); // the title is bigger than the date
    expect(lines.at(-1)!.kind).toBe('sign');
  });

  it('"Zapłacono" and "Otrzymano" carry the date; "Kopia" and "Do akt" are one big word', () => {
    expect(stampLines('paid', day).map((l) => l.text)).toEqual([strings.stampPaid, '22.11.2026']);
    expect(stampLines('received', day).map((l) => l.text)).toEqual([strings.stampReceived, strings.stampOnDay('22.11.2026')]);
    expect(stampLines('copy', day).map((l) => l.text)).toEqual([strings.stampCopy]);
    expect(stampLines('filed', day).map((l) => l.text)).toEqual([strings.stampFiled]);
  });

  it('the date has two-digit day and month', () => {
    expect(stampLines('paid', new Date(2027, 0, 5))[1].text).toBe('05.01.2027');
  });
});

describe('own stamp photo', () => {
  /** 40 × 40 white paper with a red stamp line across rows 18–21. */
  function photo(ink: [number, number, number]) {
    const w = 40,
      h = 40;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const y = Math.floor(i / w);
      const c = y >= 18 && y < 22 ? ink : [245, 245, 242];
      d.set([...c, 255], i * 4);
    }
    return { d, w, h };
  }

  it('the paper becomes transparent and red ink stays fully red (not darkened, not faded)', () => {
    const { d, w, h } = photo([210, 40, 55]);
    const out = extractStampInk(d, w, h);
    const at = (x: number, y: number) => Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(at(5, 5)[3]).toBe(0); // paper
    const ink = at(20, 19);
    expect(ink[3]).toBe(255);
    expect(ink[0]).toBeGreaterThan(180); // still red
    expect(ink[1]).toBeLessThan(80);
  });

  it('a light blue stamp is still picked up as ink', () => {
    const { d, w, h } = photo([90, 120, 220]);
    const out = extractStampInk(d, w, h);
    expect(out[(19 * w + 20) * 4 + 3]).toBeGreaterThan(200);
  });
});
