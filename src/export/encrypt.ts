/**
 * Locks a finished PDF with a password (AES-256): it opens only after typing it. The library that
 * can encrypt is loaded only here, when someone sets a password, so the app does not grow for others.
 */
export async function encryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.encrypt({
    userPassword: password,
    ownerPassword: password,
    // the one who knows the password may do everything: print, copy, fill in
    permissions: {
      printing: 'highResolution',
      modifying: true,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: true,
    },
  });
  return doc.save({ useObjectStreams: false });
}
