import { parsePageRange } from '../../src/model/pageRange';

describe('page range ("2-4, 7")', () => {
  it('empty means every page', () => {
    expect(parsePageRange('', 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parsePageRange('   ', 3)).toEqual([0, 1, 2]);
  });

  it('single pages, ranges, spaces and dashes of any kind; order kept, no repeats', () => {
    expect(parsePageRange('2-4, 7', 10)).toEqual([1, 2, 3, 6]);
    expect(parsePageRange('5 – 3', 10)).toEqual([4, 3, 2]);
    expect(parsePageRange('1;1,2', 3)).toEqual([0, 1]);
    expect(parsePageRange('3 1', 3)).toEqual([2, 0]);
  });

  it('pages that do not exist or text that is not a range: null', () => {
    expect(parsePageRange('0', 3)).toBeNull();
    expect(parsePageRange('4', 3)).toBeNull();
    expect(parsePageRange('2-9', 3)).toBeNull();
    expect(parsePageRange('abc', 3)).toBeNull();
    expect(parsePageRange('1-', 3)).toBeNull();
  });
});
