import { effectiveRotation, type Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import { releaseCanvas, renderPage } from '../imaging/render';

const SIDE = 160;

/** Small picture of a page for "Moje dokumenty", turned as the page is (JPEG data URL), or null. */
export async function docThumbnail(page: Page, source: SourceFile): Promise<string | null> {
  let raw: HTMLCanvasElement | null = null;
  try {
    raw = await renderPage(source, page.source, SIDE);
    const turn = effectiveRotation(page); // rendered raw: the page's own /Rotate plus the user's turn
    const side = turn === 90 || turn === 270;
    const out = document.createElement('canvas');
    out.width = side ? raw.height : raw.width;
    out.height = side ? raw.width : raw.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(raw, -raw.width / 2, -raw.height / 2);
    const url = out.toDataURL('image/jpeg', 0.7);
    releaseCanvas(out);
    return url.startsWith('data:image') ? url : null;
  } catch {
    return null;
  } finally {
    if (raw) releaseCanvas(raw);
  }
}
