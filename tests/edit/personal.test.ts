import { findPersonal, validPesel, type OcrLine } from '../../src/edit/personal';

/** A line of words laid out left to right, 10 px per letter, one space = 10 px. */
function line(text: string, y = 100): OcrLine {
  let x = 0;
  return {
    words: text.split(' ').map((w) => {
      const word = { text: w, bbox: { x0: x, y0: y, x1: x + w.length * 10, y1: y + 20 } };
      x += (w.length + 1) * 10;
      return word;
    }),
  };
}

describe('finding personal data in recognised text', () => {
  it('PESEL with a valid check digit; a wrong check digit is not a PESEL', () => {
    expect(validPesel('44051401359')).toBe(true);
    expect(validPesel('44051401358')).toBe(false);
    const found = findPersonal([line('PESEL: 44051401359 data'), line('nr 44051401358', 140)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'pesel', x0: 70, x1: 180 });
  });

  it('an account number written in groups is one box over all its words', () => {
    const [f] = findPersonal([line('Konto: PL61 1090 1014 0000 0712 1981 2874 dziękuję')]);
    expect(f.kind).toBe('account');
    expect(f.x0).toBe(70);
    expect(f.x1).toBe(410); // the end of the last group
  });

  it('ID card and passport numbers, phone numbers, e-mails', () => {
    const kinds = findPersonal([
      line('Dowód ABC 123456 ważny'),
      line('paszport EA1234567', 130),
      line('tel. +48 601 234 567 albo 22-123-45-67', 160),
      line('pisz: jan.kowalski@poczta.pl dzięki', 190),
    ]).map((f) => f.kind);
    expect(kinds).toEqual(['id', 'id', 'phone', 'phone', 'email']);
  });

  it('an e-mail whose @ was read as Q (a common misreading) is still found; ordinary words are not', () => {
    expect(findPersonal([line('E-mail: jan.kowalskiQpoczta.pl')]).map((f) => f.kind)).toEqual(['email']);
    expect(findPersonal([line('Quiz Quality Qatar ul. Quarta 5')])).toEqual([]);
  });

  it('ordinary numbers, dates, amounts and postcodes are left alone', () => {
    expect(findPersonal([line('Faktura 12/2026 z dnia 21.11.2026 kwota 1 234,56 zł kod 00-950 Warszawa strona 2')])).toEqual([]);
  });
});
