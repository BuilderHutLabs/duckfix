// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { encryptPdf } from '../../src/export/encrypt';

async function plainPdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([200, 300]);
  return pdf.save();
}

async function openWith(bytes: Uint8Array, password?: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password, isEvalSupported: false });
  return task.promise;
}

describe('PDF password', () => {
  it('the saved file opens only with the password, with all its pages', async () => {
    const locked = await encryptPdf(await plainPdf(2), 'kaczka 123');
    await expect(openWith(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    await expect(openWith(locked, 'zle')).rejects.toMatchObject({ name: 'PasswordException' });
    const doc = await openWith(locked, 'kaczka 123');
    expect(doc.numPages).toBe(2);
    await doc.destroy();
  });

  it('uses AES-256', async () => {
    const locked = await encryptPdf(await plainPdf(1), 'x');
    const text = new TextDecoder('latin1').decode(locked);
    expect(text).toMatch(/\/Encrypt/);
    expect(text).toMatch(/\/AESV3/);
  });
});
