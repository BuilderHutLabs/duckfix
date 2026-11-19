export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

function download(file: File): void {
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
  download(file);
  return 'downloaded';
}
