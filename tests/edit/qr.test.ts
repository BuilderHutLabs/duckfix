import { cardPayload, normalizeAccount, payPayload, qrMatrix, utf8Binary } from '../../src/edit/qr';

describe('Kod QR: przelew (polski standard dla aplikacji bankowych)', () => {
  const pay = {
    name: 'Kaczka Sp. z o.o.',
    account: 'PL 61 1090 1014 0000 0712 1981 2874',
    amount: '123,45',
    title: 'Faktura 12/2026',
    nip: '',
  };

  it('nine fields split by |: NIP, PL, 26-digit account, amount in grosze (6 digits), name, title, 3 empty', () => {
    expect(payPayload(pay)).toBe('|PL|61109010140000071219812874|012345|Kaczka Sp. z o.o.|Faktura 12/2026|||');
  });

  it('the account may be typed with spaces and PL; it must have 26 digits', () => {
    expect(normalizeAccount('PL61 1090 1014 0000 0712 1981 2874')).toBe('61109010140000071219812874');
    expect(normalizeAccount('61 1090 1014')).toBeNull();
    expect(payPayload({ ...pay, account: '123' })).toBeNull();
  });

  it('Polish letters are written plainly (banks read them reliably); the name keeps 20 signs, the title 32', () => {
    const p = payPayload({ ...pay, name: 'Łódzka Spółdzielnia Mieszkaniowa', title: 'Opłata za czynsz i media za listopad 2026 r.' })!;
    const [, , , , name, title] = p.split('|');
    expect(name).toBe('Lodzka Spoldzielnia ');
    expect(name).toHaveLength(20);
    expect(title).toHaveLength(32);
    expect(title.startsWith('Oplata za czynsz')).toBe(true);
  });

  it('amount: "50", "50.5" and "1 234,56" work; empty means no amount; above 9999,99 is refused', () => {
    expect(payPayload({ ...pay, amount: '50' })!.split('|')[3]).toBe('005000');
    expect(payPayload({ ...pay, amount: '50.5' })!.split('|')[3]).toBe('005050');
    expect(payPayload({ ...pay, amount: '1 234,56' })!.split('|')[3]).toBe('123456');
    expect(payPayload({ ...pay, amount: '' })!.split('|')[3]).toBe('000000');
    expect(payPayload({ ...pay, amount: '10000' })).toBeNull();
  });

  it('a NIP of 10 digits goes first; a wrong one is refused', () => {
    expect(payPayload({ ...pay, nip: '123-456-78-90' })!.startsWith('1234567890|PL|')).toBe(true);
    expect(payPayload({ ...pay, nip: '12345' })).toBeNull();
  });

  it('a name is needed', () => {
    expect(payPayload({ ...pay, name: '  ' })).toBeNull();
  });
});

describe('Kod QR: wizytówka', () => {
  it('a vCard with name, phone and e-mail (Polish letters kept)', () => {
    const v = cardPayload({ name: 'Łukasz Kaczmarek', phone: '+48 600 100 200', email: 'lukasz@example.com', org: '' })!;
    expect(v.split('\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Kaczmarek;Łukasz;;;',
      'FN:Łukasz Kaczmarek',
      'TEL:+48600100200',
      'EMAIL:lukasz@example.com',
      'END:VCARD',
    ]);
  });

  it('needs a name and a phone or an e-mail', () => {
    expect(cardPayload({ name: '', phone: '600', email: '', org: '' })).toBeNull();
    expect(cardPayload({ name: 'Jan', phone: '', email: '', org: '' })).toBeNull();
  });
});

describe('Kod QR: the code itself', () => {
  it('is a square of dark and light modules with the three corner squares', () => {
    const m = qrMatrix('https://example.com');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // the top-left finder pattern: a dark 7×7 ring
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(m[6].slice(0, 7).every(Boolean)).toBe(true);
    expect(m[1][1]).toBe(false);
  });

  it('Polish letters go in as UTF-8 bytes (ą = C4 85), not cut to one byte', () => {
    expect(Array.from(utf8Binary('ą'), (c) => c.charCodeAt(0))).toEqual([0xc4, 0x85]);
    expect(utf8Binary('abc')).toBe('abc');
  });
});
