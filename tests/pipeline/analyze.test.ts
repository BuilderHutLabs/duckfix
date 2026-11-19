import { beforeEach, describe, expect, it, vi } from 'vitest';

const skew = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../src/imaging/deskew', () => ({ MIN_SKEW_SCORE: 1.25, estimateSkew: skew.fn }));

import { analyzePages, type AnalyzeDeps, type PageAnalysis } from '../../src/pipeline/analyze';
import { createMetrics } from '../../src/diagnostics/metrics';
import type { Page, Rotation } from '../../src/model/document';
import type { SourceFile } from '../../src/import/importFiles';

const inkyGray = () => ({ data: Uint8Array.from([0, 0, 255, 255]), width: 2, height: 2 });
const blankGray = () => ({ data: new Uint8Array(4).fill(255), width: 2, height: 2 });

function pdfPage(
  id: string,
  over: { baseRotation?: Rotation; hasTextLayer?: boolean; analyzed?: boolean } = {},
): Page {
  return {
    id,
    source: {
      kind: 'pdf',
      fileId: 'f',
      pageIndex: 0,
      baseRotation: over.baseRotation ?? 0,
      hasTextLayer: over.hasTextLayer ?? false,
    },
    rotation: 0,
    skewDeg: 0,
    flags: [],
    autoRotation: null,
    analyzed: over.analyzed ?? false,
  };
}

function setup(det: { rotation: Rotation; confidence: number }, verify?: Rotation) {
  const render = vi.fn(async () => ({}) as HTMLCanvasElement);
  const release = vi.fn();
  const verifyUpright = vi.fn(async (_c: unknown, _cands: [Rotation, Rotation]) => verify ?? (0 as Rotation));
  const detect = vi.fn(async () => det);
  const toGrayImage = vi.fn((_c: HTMLCanvasElement, _r: Rotation) => inkyGray());
  const deps: AnalyzeDeps = {
    render: render as never,
    release,
    detector: { detect, verifyUpright, dispose: async () => {} },
    thresholds: { minConfidence: 2, minInk: 0.01 },
    getSource: () => ({ id: 'f', name: 'f', type: 'pdf', blob: new Blob() }) as SourceFile,
    toGrayImage,
  };
  return { deps, render, release, verifyUpright, detect, toGrayImage };
}

async function run(pages: Page[], deps: AnalyzeDeps, deskew = true): Promise<PageAnalysis[]> {
  const out: PageAnalysis[] = [];
  await analyzePages(pages, deps, (a) => out.push(a), { concurrency: 2, maxSide: 100, deskew });
  return out;
}

beforeEach(() => {
  skew.fn.mockReset();
  skew.fn.mockReturnValue({ angleDeg: 0, score: 0 });
});

describe('analyzePages', () => {
  it('accepts a confident rotation with no flags', async () => {
    const s = setup({ rotation: 90, confidence: 8 });
    const [r] = await run([pdfPage('a')], s.deps);
    expect(r).toMatchObject({ pageId: 'a', rotation: 90, flags: [], confidence: 8 });
    expect(s.verifyUpright).not.toHaveBeenCalled();
  });

  it('converts to model frame by subtracting baseRotation', async () => {
    const a = setup({ rotation: 90, confidence: 8 });
    expect((await run([pdfPage('a', { baseRotation: 90 })], a.deps))[0].rotation).toBe(0);
    const b = setup({ rotation: 0, confidence: 8 });
    expect((await run([pdfPage('a', { baseRotation: 90 })], b.deps))[0].rotation).toBe(270);
  });

  it('verifies when uncertain, uses the result, keeps the flag, candidates in raw frame', async () => {
    const s = setup({ rotation: 90, confidence: 1 }, 270);
    const [r] = await run([pdfPage('a', { baseRotation: 90 })], s.deps);
    expect(s.verifyUpright).toHaveBeenCalledTimes(1);
    expect(s.verifyUpright.mock.calls[0][1]).toEqual([90, 270]);
    expect(r.rotation).toBe(180); // 270 - 90
    expect(r.flags).toEqual(['check-orientation']);
  });

  it('falls back to the OSD rotation (flag kept) when verifyUpright fails', async () => {
    const s = setup({ rotation: 180, confidence: 1 });
    s.verifyUpright.mockRejectedValueOnce(new Error('ocr model missing'));
    const [r] = await run([pdfPage('a', { baseRotation: 90 })], s.deps);
    expect(s.verifyUpright).toHaveBeenCalledTimes(1);
    expect(r.rotation).toBe(90); // OSD raw 180 - base 90
    expect(r.flags).toEqual(['check-orientation']);
    expect(r.confidence).toBe(1);
    expect(r.error).toBeUndefined();
  });

  it('records the error message of a failed page', async () => {
    const s = setup({ rotation: 0, confidence: 8 });
    s.detect.mockRejectedValueOnce(new Error('boom'));
    const [r] = await run([pdfPage('a')], s.deps);
    expect(r.error).toBe('boom');
  });

  it('flags low-text and leaves rotation 0 on blank pages', async () => {
    const s = setup({ rotation: 90, confidence: 8 });
    s.toGrayImage.mockReturnValue(blankGray());
    const [r] = await run([pdfPage('a')], s.deps);
    expect(r).toMatchObject({ rotation: 0, flags: ['low-text'] });
  });

  it('keeps the PDF orientation (model rotation 0) for low-text pages with baseRotation', async () => {
    const s = setup({ rotation: 180, confidence: 8 });
    s.toGrayImage.mockReturnValue(blankGray());
    const [r] = await run([pdfPage('a', { baseRotation: 90 })], s.deps);
    expect(r).toMatchObject({ rotation: 0, flags: ['low-text'] });
  });

  it('emits model rotation 0 on error even with baseRotation', async () => {
    const s = setup({ rotation: 180, confidence: 8 });
    s.detect.mockRejectedValueOnce(new Error('boom'));
    const [r] = await run([pdfPage('a', { baseRotation: 90 })], s.deps);
    expect(r).toMatchObject({ rotation: 0, skewDeg: 0, flags: ['check-orientation'] });
  });

  describe('deskew gate', () => {
    it('applies a confident angle above 0.3 on the upright image', async () => {
      skew.fn.mockReturnValue({ angleDeg: -1.5, score: 2 });
      const s = setup({ rotation: 90, confidence: 8 });
      const [r] = await run([pdfPage('a')], s.deps);
      expect(r.skewDeg).toBe(-1.5);
      expect(s.toGrayImage).toHaveBeenLastCalledWith(expect.anything(), 90);
    });

    it('refuses a low score', async () => {
      skew.fn.mockReturnValue({ angleDeg: -1.5, score: 1.2 });
      const [r] = await run([pdfPage('a')], setup({ rotation: 0, confidence: 8 }).deps);
      expect(r.skewDeg).toBe(0);
    });

    it('ignores |angle| <= 0.3', async () => {
      skew.fn.mockReturnValue({ angleDeg: 0.3, score: 5 });
      const [r] = await run([pdfPage('a')], setup({ rotation: 0, confidence: 8 }).deps);
      expect(r.skewDeg).toBe(0);
      skew.fn.mockReturnValue({ angleDeg: 0.4, score: 5 });
      const [r2] = await run([pdfPage('a')], setup({ rotation: 0, confidence: 8 }).deps);
      expect(r2.skewDeg).toBe(0.4);
    });

    it('skips estimation with a text layer or deskew disabled', async () => {
      skew.fn.mockReturnValue({ angleDeg: -2, score: 5 });
      const [r] = await run([pdfPage('a', { hasTextLayer: true })], setup({ rotation: 0, confidence: 8 }).deps);
      const [r2] = await run([pdfPage('a')], setup({ rotation: 0, confidence: 8 }).deps, false);
      expect([r.skewDeg, r2.skewDeg]).toEqual([0, 0]);
      expect(skew.fn).not.toHaveBeenCalled();
    });
  });

  it('releases every rendered canvas and skips analyzed pages', async () => {
    const s = setup({ rotation: 0, confidence: 8 });
    const out = await run([pdfPage('a'), pdfPage('b', { analyzed: true }), pdfPage('c')], s.deps);
    expect(out.map((r) => r.pageId).sort()).toEqual(['a', 'c']);
    expect(s.render).toHaveBeenCalledTimes(2);
    expect(s.release).toHaveBeenCalledTimes(2);
  });

  it('survives a failing page: neutral result, canvas released, run continues', async () => {
    const s = setup({ rotation: 90, confidence: 8 });
    s.detect.mockRejectedValueOnce(new Error('boom'));
    const out = await run([pdfPage('a'), pdfPage('b')], s.deps);
    const bad = out.find((r) => r.confidence === 0)!;
    expect(bad).toMatchObject({ rotation: 0, skewDeg: 0, flags: ['check-orientation'] });
    expect(out).toHaveLength(2);
    expect(s.release).toHaveBeenCalledTimes(2);
  });

  it('survives a render failure without releasing anything', async () => {
    const s = setup({ rotation: 0, confidence: 8 });
    s.render.mockRejectedValueOnce(new Error('no render'));
    const out = await run([pdfPage('a')], s.deps);
    expect(out[0].flags).toEqual(['check-orientation']);
    expect(s.release).not.toHaveBeenCalled();
  });
});

describe('createMetrics', () => {
  it('reports failed pages and the last error message', () => {
    const m = createMetrics();
    m.record({ pageId: 'a', rotation: 0, skewDeg: 0, flags: [], confidence: 4, ms: 10 });
    m.record({ pageId: 'b', rotation: 0, skewDeg: 0, flags: ['check-orientation'], confidence: 0, ms: 5, error: 'first' });
    m.record({ pageId: 'c', rotation: 0, skewDeg: 0, flags: ['check-orientation'], confidence: 0, ms: 5, error: 'render failed' });
    const text = m.report({ pages: [] }, 'dev');
    expect(text).toContain('Błędy analizy: 2');
    expect(text).toContain('Ostatni błąd: render failed');
  });

  it('reports zero failures without a last-error line', () => {
    const m = createMetrics();
    m.record({ pageId: 'a', rotation: 0, skewDeg: 0, flags: [], confidence: 4, ms: 10 });
    const text = m.report({ pages: [] }, 'dev');
    expect(text).toContain('Błędy analizy: 0');
    expect(text).not.toContain('Ostatni błąd');
  });

  it('reports counts, timing, rotations and untouchedRate', () => {
    const m = createMetrics();
    m.record({ pageId: 'a', rotation: 90, skewDeg: 0, flags: [], confidence: 4, ms: 100 });
    m.record({ pageId: 'b', rotation: 0, skewDeg: 0, flags: ['check-orientation'], confidence: 2, ms: 300 });
    const doc = {
      pages: [{ ...pdfPage('a'), analyzed: true, rotation: 90 as Rotation, autoRotation: 90 as Rotation }],
    };
    const text = m.report(doc, 'test-device');
    expect(text).toContain('test-device');
    expect(text).toContain('Liczba stron: 2');
    expect(text).toContain('200 ms');
    expect(text).toContain('400 ms');
    expect(text).toContain('90°=1');
    expect(text).toContain('100%');
    expect(text).toContain('check-orientation=1');
  });
});
