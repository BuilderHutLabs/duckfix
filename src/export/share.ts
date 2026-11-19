export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Saves the file through a download link (Downloads folder on Windows/Android). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pdfFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

/**
 * Opens the share sheet, or downloads when file sharing is unsupported. Call it straight from a
 * tap: navigator.share needs a fresh user activation (it expires during a long export).
 */
export async function shareOrDownload(file: File): Promise<ShareResult> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // any other failure: fall back to download
    }
  }
  downloadFile(file);
  return 'downloaded';
}

/**
 * iPhone/iPad: a blob download is unreliable (esp. in the installed app), so saving goes through
 * the share sheet ("Zachowaj w Plikach"). Everywhere else the share sheet has no "save" option,
 * so saving is a plain download. iPadOS reports a Mac UA; touch points tell it apart.
 */
export function prefersShareSheet(): boolean {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}
