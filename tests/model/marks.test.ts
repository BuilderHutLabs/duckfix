import { addMark, removeMark, setCrop, updateMark, type Mark } from '../../src/model/document';
import { docWithFlags } from '../ui/fixtures';

const black: Mark = { id: 'm1', kind: 'cover', color: 'black', x: 0.1, y: 0.2, w: 0.3, h: 0.05 };
const white: Mark = { id: 'm2', kind: 'cover', color: 'white', x: 0.5, y: 0.5, w: 0.2, h: 0.1 };

describe('page marks and crop', () => {
  it('add, update and remove a mark leave the other marks alone', () => {
    let doc = addMark(addMark(docWithFlags(2), 'p1', black), 'p1', white);
    expect(doc.pages[0].marks).toHaveLength(2);
    expect(doc.pages[1].marks).toBeUndefined();
    doc = updateMark(doc, 'p1', 'm1', { x: 0.4, color: 'white' });
    expect(doc.pages[0].marks![0]).toMatchObject({ x: 0.4, color: 'white', w: 0.3 });
    expect(doc.pages[0].marks![1]).toEqual(white);
    doc = removeMark(doc, 'p1', 'm1');
    expect(doc.pages[0].marks).toEqual([white]);
  });

  it('crop is set on the given pages; the whole page means no crop', () => {
    let doc = setCrop(docWithFlags(3), ['p1', 'p3'], { x: 0.1, y: 0.1, w: 0.8, h: 0.7 });
    expect(doc.pages[0].crop).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.7 });
    expect(doc.pages[1].crop).toBeUndefined();
    expect(doc.pages[2].crop).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.7 });
    doc = setCrop(doc, ['p1'], { x: 0.001, y: 0, w: 0.999, h: 1 });
    expect(doc.pages[0].crop).toBeUndefined();
    doc = setCrop(doc, ['p3'], undefined);
    expect(doc.pages[2].crop).toBeUndefined();
  });
});
