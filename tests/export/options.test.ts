import { loadExportOptions } from '../../src/export/options';

const storage = (v: unknown) => ({ getItem: () => JSON.stringify(v), setItem: () => {} });

describe('save options', () => {
  it('the file size choice is remembered', () => {
    expect(loadExportOptions(storage({ size: 'office', ocr: true, format: 'jpg' }))).toEqual({ size: 'office', ocr: true, format: 'jpg' });
  });

  it('"Mniejszy plik" and the 1 MB size of earlier versions become "Do urzędu"; nothing chosen is "Najlepsza jakość"', () => {
    expect(loadExportOptions(storage({ compress: true, ocr: false, format: 'pdf' })).size).toBe('office');
    expect(loadExportOptions(storage({ size: 'small' })).size).toBe('office');
    expect(loadExportOptions(storage({ compress: false })).size).toBe('best');
    expect(loadExportOptions(null).size).toBe('best');
  });
});
