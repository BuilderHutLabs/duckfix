import { describe, expect, it, vi } from 'vitest';

// The default loader must use the pdf.js legacy build (library + worker): the modern build needs
// Promise.withResolvers (iPadOS 17.4+) and fails on older iPads.
const legacy = vi.hoisted(() => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ destroy: async () => {} }) })),
}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => legacy);
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/wduck/assets/pdf.worker.legacy.mjs' }));
vi.mock('pdfjs-dist', () => {
  throw new Error('modern pdf.js build must not be loaded');
});

import { getPdf } from '../../src/imaging/render';

describe('default pdf.js loader', () => {
  it('loads the legacy library and the local legacy worker', async () => {
    await getPdf({ id: 'x', name: 'x.pdf', type: 'pdf', blob: new Blob(['%PDF']) });
    expect(legacy.getDocument).toHaveBeenCalledTimes(1);
    expect(legacy.GlobalWorkerOptions.workerSrc).toBe('/wduck/assets/pdf.worker.legacy.mjs');
  });
});
