import { loadExportOptions } from '../../src/export/options';

const storage = (v: unknown) => ({ getItem: () => JSON.stringify(v), setItem: () => {} });

describe('save options', () => {
  it('the file size choice is remembered', () => {
    expect(loadExportOptions(storage({ size: 'small', ocr: true, format: 'jpg' }))).toEqual({ size: 'small', ocr: true, format: 'jpg' });
  });

  it('"Mniejszy plik" of earlier versions becomes "Do maila"; nothing chosen is "Najlepsza jakość"', () => {
    expect(loadExportOptions(storage({ compress: true, ocr: false, format: 'pdf' })).size).toBe('mail');
    expect(loadExportOptions(storage({ compress: false })).size).toBe('best');
    expect(loadExportOptions(null).size).toBe('best');
  });
});
