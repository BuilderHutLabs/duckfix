import { loadPhoto, WORK_SIDE } from '../../src/scan/warp';

// jsdom has no image decoding: fake createImageBitmap / canvas just enough to see what is kept in memory
function fakeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() };
}

describe('loadPhoto keeps memory low on phones', () => {
  const created: Blob[] = [];
  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((b: Blob) => (created.push(b), 'blob:x')), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(['small'], { type: 'image/jpeg' }));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a 50 MP photo is decoded at the working size, never kept full size', async () => {
    const full = fakeBitmap(8160, 6120);
    const small = fakeBitmap(WORK_SIDE, 1800);
    const decode = vi.fn(async (_src: unknown, opts?: ImageBitmapOptions) => (opts?.resizeWidth ? small : full));
    vi.stubGlobal('createImageBitmap', decode);
    const file = new File(['x'.repeat(10)], 'IMG.jpg', { type: 'image/jpeg' });
    const p = await loadPhoto(file);
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(WORK_SIDE * (4 / 3));
    expect(decode.mock.calls.some(([, o]) => o?.resizeWidth)).toBe(true);
    // the on-screen preview is a small copy, not the original photo file
    expect(created).not.toContain(file);
  });

  it('a decoder that ignores the resize request is shrunk right away and the big bitmap freed', async () => {
    const full = fakeBitmap(8160, 6120);
    const shrunk = fakeBitmap(WORK_SIDE, 1800);
    let calls = 0;
    vi.stubGlobal('createImageBitmap', vi.fn(async () => (calls++ === 0 ? full : shrunk)));
    const p = await loadPhoto(new File(['x'], 'IMG.jpg', { type: 'image/jpeg' }));
    expect(full.close).toHaveBeenCalled();
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(WORK_SIDE);
  });
});
