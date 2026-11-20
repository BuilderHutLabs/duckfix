import { ocrLangs } from '../../src/export/ocr';

describe('OCR languages', () => {
  it('app language + English (Polish keeps Polish + English)', () => {
    expect(ocrLangs('pl')).toBe('pol+eng');
    expect(ocrLangs('en')).toBe('eng');
    expect(ocrLangs('de')).toBe('deu+eng');
    expect(ocrLangs('es')).toBe('spa+eng');
  });
});
