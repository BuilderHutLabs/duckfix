import { createWorker, OEM, type Worker, type WorkerOptions } from 'tesseract.js';
import type { Lang } from '../i18n';
import type { OcrLine } from '../edit/personal';

/**
 * "Tekst do wyszukiwania": recognizes the final page image and returns an invisible text layer.
 *
 * Technique: tesseract's own text-only PDF renderer (`pdfTextOnly`). It writes the words with a
 * glyph-less font whose codes are Unicode, so ą/ł/ß/ñ stay searchable and copyable, and positions
 * them over the image it was given. exportPdf scales that page onto the real page size.
 */
export interface OcrEngine {
  /** One-page PDF with only invisible text, laid out over `image` (PNG or JPEG bytes). */
  textLayer(image: Blob | Uint8Array): Promise<Uint8Array>;
  /** Recognized plain text of an upright page image. */
  text(image: Blob | Uint8Array): Promise<string>;
  /** Recognized lines of words with their boxes (pixels of `image`), for "Ukryj dane osobowe". */
  lines?(image: Blob | Uint8Array): Promise<OcrLine[]>;
  dispose(): Promise<void>;
}

/** Tesseract languages for the app language; English is always added for mixed documents. */
export function ocrLangs(lang: Lang): string {
  return { pl: 'pol+eng', en: 'eng', de: 'deu+eng', es: 'spa+eng' }[lang];
}

export async function createOcrEngine(lang: Lang, paths: Partial<WorkerOptions>): Promise<OcrEngine> {
  const worker: Worker = await createWorker(ocrLangs(lang), OEM.LSTM_ONLY, paths);
  return {
    async textLayer(image) {
      const input = await toWorkerInput(image);
      const { data } = await worker.recognize(
        input as Parameters<Worker['recognize']>[0],
        { pdfTextOnly: true },
        { pdf: true, text: false, blocks: false },
      );
      if (!data.pdf) throw new Error('OCR produced no PDF');
      return Uint8Array.from(data.pdf);
    },
    async text(image) {
      const { data } = await worker.recognize((await toWorkerInput(image)) as Parameters<Worker['recognize']>[0]);
      return data.text ?? '';
    },
    async lines(image) {
      const { data } = await worker.recognize(
        (await toWorkerInput(image)) as Parameters<Worker['recognize']>[0],
        {},
        { blocks: true, text: false },
      );
      const out: OcrLine[] = [];
      for (const block of data.blocks ?? [])
        for (const para of block.paragraphs)
          for (const line of para.lines) out.push({ words: line.words.map((w) => ({ text: w.text, bbox: w.bbox })) });
      return out;
    },
    async dispose() {
      await worker.terminate();
    },
  };
}

/** The browser worker reads Blobs; tesseract.js in Node (tests) reads Buffers only. */
async function toWorkerInput(image: Blob | Uint8Array): Promise<Blob | Uint8Array> {
  const NodeBuffer = typeof window === 'undefined' ? (globalThis as { Buffer?: { from(b: Uint8Array): Uint8Array } }).Buffer : undefined;
  if (!NodeBuffer) return image instanceof Blob ? image : new Blob([image as BlobPart]);
  return NodeBuffer.from(image instanceof Blob ? new Uint8Array(await image.arrayBuffer()) : image);
}
