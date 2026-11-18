import { createHistory } from '../../src/model/history';

describe('createHistory', () => {
  it('push/undo/redo, and push clears redo', () => {
    const h = createHistory('a');
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    h.push('b'); h.push('c');
    expect(h.present).toBe('c');
    expect(h.canUndo).toBe(true);
    h.undo(); expect(h.present).toBe('b');
    h.undo(); expect(h.present).toBe('a');
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    h.redo(); expect(h.present).toBe('b');
    h.push('d');
    expect(h.present).toBe('d');
    expect(h.canRedo).toBe(false);
    h.redo(); expect(h.present).toBe('d');
  });
  it('undo/redo at the ends are no-ops', () => {
    const h = createHistory(1);
    h.undo(); h.redo();
    expect(h.present).toBe(1);
  });
});

describe('mapAll', () => {
  it('rewrites past, present and future without adding an entry', () => {
    const h = createHistory('a');
    h.push('b'); h.push('c');
    h.undo(); // present b, future c
    h.mapAll((s) => s.toUpperCase());
    expect(h.present).toBe('B');
    h.undo(); expect(h.present).toBe('A');
    expect(h.canUndo).toBe(false);
    h.redo(); h.redo(); expect(h.present).toBe('C');
    expect(h.canRedo).toBe(false);
  });
});
