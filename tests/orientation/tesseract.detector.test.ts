// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const created: Array<{ terminate: ReturnType<typeof vi.fn>; recognize: ReturnType<typeof vi.fn> }> = [];
let failOnCall = -1;
let calls = 0;

vi.mock('tesseract.js', () => ({
  OEM: { TESSERACT_ONLY: 0, LSTM_ONLY: 1 },
  createWorker: vi.fn(async () => {
    const i = calls++;
    if (i === failOnCall) throw new Error('missing model');
    const w = {
      terminate: vi.fn(async () => {}),
      recognize: vi.fn(async () => ({ data: { words: [{ confidence: 50 }], confidence: 50 } })),
    };
    created.push(w);
    return w;
  }),
}));

import { createTesseractDetector } from '../../src/orientation/tesseract';

afterEach(() => {
  created.length = 0;
  calls = 0;
  failOnCall = -1;
  vi.unstubAllGlobals();
});

describe('createTesseractDetector', () => {
  it('terminates workers that did start when another one fails, then rethrows', async () => {
    failOnCall = 1;
    await expect(createTesseractDetector({ basePath: '/wduck/', workers: 3 })).rejects.toThrow('missing model');
    expect(created).toHaveLength(2);
    for (const w of created) expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('passes workerBlobURL: false so the worker script loads from /wduck/tesseract/', async () => {
    const { createWorker } = await import('tesseract.js');
    vi.mocked(createWorker).mockClear();
    const d = await createTesseractDetector({ basePath: '/wduck/', workers: 1 });
    const opts = vi.mocked(createWorker).mock.calls[0][2] as Record<string, unknown>;
    expect(opts).toMatchObject({ workerBlobURL: false, workerPath: '/wduck/tesseract/worker.min.js' });
    await d.dispose();
  });

  it('retries creating the OCR worker after a failed start', async () => {
    const d = await createTesseractDetector({ basePath: '/wduck/', workers: 1 });
    failOnCall = calls; // the next createWorker call (the OCR worker) fails
    const src = { width: 10, height: 10 } as unknown as OffscreenCanvas;
    await expect(d.verifyUpright!(src, [0, 180])).rejects.toThrow('missing model');
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { translate() {}, rotate() {}, drawImage() {} };
      }
    });
    await expect(d.verifyUpright!(src, [0, 180])).resolves.toBe(0);
    await d.dispose();
  });

  it('zeroes the size of rotated canvas copies after verifyUpright', async () => {
    const copies: Array<{ width: number; height: number }> = [];
    class FakeOffscreen {
      constructor(public width: number, public height: number) {
        copies.push(this);
      }
      getContext() {
        return { translate() {}, rotate() {}, drawImage() {} };
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
    const src = { width: 100, height: 50 } as unknown as OffscreenCanvas;
    const d = await createTesseractDetector({ basePath: '/wduck/', workers: 1 });
    await d.verifyUpright!(src, [0, 90]);
    // rotation 0 reuses src (untouched); the 90 copy is released
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ width: 0, height: 0 });
    expect(src.width).toBe(100);
    await d.dispose();
  });
});
