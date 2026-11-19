import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfFile, shareOrDownload } from '../../src/export/share';

const bytes = new Uint8Array([1, 2, 3]);
const file = (name = 'a.pdf') => pdfFile(bytes, name);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubDownload() {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return click;
}

describe('pdfFile', () => {
  it('wraps the bytes in a named application/pdf File', async () => {
    const f = pdfFile(bytes, 'x_wduck.pdf');
    expect(f.name).toBe('x_wduck.pdf');
    expect(f.type).toBe('application/pdf');
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(bytes);
  });
});

describe('shareOrDownload', () => {
  it('shares when canShare accepts files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(file('a_wduck.pdf'))).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe('a_wduck.pdf');
    expect(arg.files[0].type).toBe('application/pdf');
  });

  it('returns cancelled on AbortError', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(err) });
    expect(await shareOrDownload(file())).toBe('cancelled');
  });

  it('downloads when share is unsupported and revokes URL later', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {});
    const click = stubDownload();
    expect(await shareOrDownload(file())).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('downloads when share fails with another error', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) });
    const click = stubDownload();
    expect(await shareOrDownload(file())).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('prefersShareSheet', () => {
  const ua = (userAgent: string, maxTouchPoints = 0) => vi.stubGlobal('navigator', { userAgent, maxTouchPoints });

  it('is true on iPhone and iPad (incl. iPadOS desktop-class UA with touch)', async () => {
    const { prefersShareSheet } = await import('../../src/export/share');
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
    expect(prefersShareSheet()).toBe(true);
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15', 5);
    expect(prefersShareSheet()).toBe(true);
  });

  it('is false on Windows, Android and a Mac without touch', async () => {
    const { prefersShareSheet } = await import('../../src/export/share');
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36');
    expect(prefersShareSheet()).toBe(false);
    ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 5);
    expect(prefersShareSheet()).toBe(false);
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15', 0);
    expect(prefersShareSheet()).toBe(false);
  });
});

describe('downloadFile', () => {
  it('clicks a download link named after the file', async () => {
    const { downloadFile } = await import('../../src/export/share');
    const click = stubDownload();
    let name = '';
    click.mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    downloadFile(file('b_wduck.pdf'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(name).toBe('b_wduck.pdf');
  });
});
