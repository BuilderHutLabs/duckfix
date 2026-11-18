import {
  addRotation, rotatePages, movePage, deletePages, insertPages, applyAnalysis,
  clearFlag, effectiveRotation, untouchedRate,
  type Doc, type Page, type Rotation,
} from '../../src/model/document';

const pdfPage = (id: string, over: Partial<Page> = {}, base: Rotation = 0): Page => ({
  id,
  source: { kind: 'pdf', fileId: 'f', pageIndex: 0, baseRotation: base, hasTextLayer: true },
  rotation: 0, skewDeg: 0, flags: [], autoRotation: null, analyzed: false,
  ...over,
});
const docOf = (...ids: string[]): Doc => ({ pages: ids.map((i) => pdfPage(i)) });
const ids = (d: Doc) => d.pages.map((p) => p.id);

describe('addRotation', () => {
  it('wraps mod 360 and accepts negatives', () => {
    expect(addRotation(270, 90)).toBe(0);
    expect(addRotation(0, -90)).toBe(270);
    expect(addRotation(90, 180)).toBe(270);
    expect(addRotation(0, -270)).toBe(90);
  });
});

describe('rotatePages', () => {
  it('rotates only the given pages, purely', () => {
    const doc = docOf('a', 'b', 'c');
    const out = rotatePages(doc, ['b'], 90);
    expect(out.pages.map((p) => p.rotation)).toEqual([0, 90, 0]);
    expect(doc.pages[1].rotation).toBe(0);
    expect(out).not.toBe(doc);
  });
  it('clears check-orientation on manual rotation but keeps other flags and autoRotation', () => {
    const doc: Doc = { pages: [pdfPage('a', { flags: ['check-orientation', 'low-text'], autoRotation: 180, analyzed: true })] };
    const p = rotatePages(doc, ['a'], -90).pages[0];
    expect(p.flags).toEqual(['low-text']);
    expect(p.autoRotation).toBe(180);
    expect(p.rotation).toBe(270);
  });
  it('leaves flags of untargeted pages alone', () => {
    const doc: Doc = { pages: [pdfPage('a', { flags: ['check-orientation'] }), pdfPage('b')] };
    expect(rotatePages(doc, ['b'], 180).pages[0].flags).toEqual(['check-orientation']);
  });
});

describe('effectiveRotation', () => {
  it('adds baseRotation and rotation', () => {
    expect(effectiveRotation(pdfPage('a', { rotation: 90 }, 90))).toBe(180);
  });
  it('treats image sources as base 0', () => {
    const p: Page = { ...pdfPage('i', { rotation: 270 }), source: { kind: 'image', fileId: 'x' } };
    expect(effectiveRotation(p)).toBe(270);
  });
});

describe('movePage', () => {
  it('moves [a,b,c] 0->2 to [b,c,a]', () => {
    const doc = docOf('a', 'b', 'c');
    expect(ids(movePage(doc, 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(doc)).toEqual(['a', 'b', 'c']);
  });
  it('moves backwards', () => {
    expect(ids(movePage(docOf('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b']);
  });
});

describe('deletePages / insertPages', () => {
  it('deletes by id', () => {
    expect(ids(deletePages(docOf('a', 'b', 'c'), ['a', 'c']))).toEqual(['b']);
  });
  it('inserts at index', () => {
    const out = insertPages(docOf('a', 'b'), 1, [pdfPage('x'), pdfPage('y')]);
    expect(ids(out)).toEqual(['a', 'x', 'y', 'b']);
  });
});

describe('applyAnalysis', () => {
  it('sets rotation, skew, flags, autoRotation and analyzed', () => {
    const out = applyAnalysis(docOf('a', 'b'), 'a', { rotation: 180, skewDeg: 1.5, flags: ['low-text'] });
    const p = out.pages[0];
    expect(p).toMatchObject({ rotation: 180, autoRotation: 180, skewDeg: 1.5, flags: ['low-text'], analyzed: true });
    expect(out.pages[1].analyzed).toBe(false);
  });
});

describe('clearFlag', () => {
  it('removes only the given flag on the given page', () => {
    const doc: Doc = { pages: [pdfPage('a', { flags: ['check-orientation', 'low-text'] }), pdfPage('b', { flags: ['low-text'] })] };
    const out = clearFlag(doc, 'a', 'check-orientation');
    expect(out.pages[0].flags).toEqual(['low-text']);
    expect(out.pages[1].flags).toEqual(['low-text']);
  });
});

describe('untouchedRate', () => {
  it('is 0.75 with 4 analyzed and 1 manually changed (plus an unanalyzed page ignored)', () => {
    let doc = docOf('a', 'b', 'c', 'd', 'e');
    for (const id of ['a', 'b', 'c', 'd']) doc = applyAnalysis(doc, id, { rotation: 90, skewDeg: 0, flags: [] });
    doc = rotatePages(doc, ['a'], 90);
    expect(untouchedRate(doc)).toBe(0.75);
  });
  it('is 0 when nothing analyzed', () => {
    expect(untouchedRate(docOf('a'))).toBe(0);
  });
});
