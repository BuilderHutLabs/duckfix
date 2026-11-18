import type { Page, Rotation, SourceRef } from '../model/document';
import { forgetPdf, getPdf } from '../imaging/render';
import { ImportError } from './errors';

export interface SourceFile {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  blob: Blob;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;
const TEXT_LAYER_MIN_ITEMS = 20;

function detectType(file: File): 'pdf' | 'image' | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  return null;
}

function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
}

function newPage(source: SourceRef): Page {
  return {
    id: crypto.randomUUID(),
    source,
    rotation: 0,
    skewDeg: 0,
    flags: [],
    autoRotation: null,
    analyzed: false,
  };
}

async function importPdf(source: SourceFile): Promise<Page[]> {
  let pdf;
  try {
    pdf = await getPdf(source);
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new ImportError(
      name === 'PasswordException' ? 'encrypted' : 'corrupt',
      `${source.name}: ${name ?? 'error'}`,
    );
  }
  try {
    const pages: Page[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const p = await pdf.getPage(i + 1);
      const text = await p.getTextContent();
      pages.push(
        newPage({
          kind: 'pdf',
          fileId: source.id,
          pageIndex: i,
          baseRotation: normalizeRotation(p.rotate),
          hasTextLayer: text.items.length > TEXT_LAYER_MIN_ITEMS,
        }),
      );
      p.cleanup();
    }
    return pages;
  } catch (e) {
    await forgetPdf(source.id);
    throw new ImportError('corrupt', `${source.name}: ${(e as Error).message}`);
  }
}

export async function importFiles(files: File[]): Promise<{ sources: SourceFile[]; pages: Page[] }> {
  const sources: SourceFile[] = [];
  const pages: Page[] = [];
  try {
    for (const file of files) {
      const type = detectType(file);
      if (!type) throw new ImportError('unsupported', file.name);
      const source: SourceFile = { id: crypto.randomUUID(), name: file.name, type, blob: file };
      const added =
        type === 'pdf' ? await importPdf(source) : [newPage({ kind: 'image', fileId: source.id })];
      pages.push(...added);
      sources.push(source);
    }
  } catch (e) {
    // all-or-nothing: do not leak cached documents of already imported files
    await Promise.all(sources.map((s) => forgetPdf(s.id)));
    throw e;
  }
  return { sources, pages };
}
