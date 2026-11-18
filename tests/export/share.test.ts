import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrDownload } from '../../src/export/share';

const bytes = new Uint8Array([1, 2, 3]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubDownload() {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return click;
}

describe('shareOrDownload', () => {
  it('shares when canShare accepts files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(bytes, 'a_wduck.pdf')).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe('a_wduck.pdf');
    expect(arg.files[0].type).toBe('application/pdf');
  });

  it('returns cancelled on AbortError', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(err) });
    expect(await shareOrDownload(bytes, 'a.pdf')).toBe('cancelled');
  });

  it('downloads when share is unsupported and revokes URL later', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {});
    const click = stubDownload();
    expect(await shareOrDownload(bytes, 'a.pdf')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('downloads when share fails with another error', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) });
    const click = stubDownload();
    expect(await shareOrDownload(bytes, 'a.pdf')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
