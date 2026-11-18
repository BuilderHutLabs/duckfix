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
