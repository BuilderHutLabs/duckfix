import { STAMP_KINDS, stampLines } from '../../src/edit/stamps';
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
