import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { effectiveRotation } from '../model/document';
import { releaseCanvas, renderPage } from '../imaging/render';
import { applyCanvasFilter } from '../imaging/filter';
import type { ThumbnailCache } from './thumbnails';
import { useAppStore } from './store';
import { strings } from './strings';
import { IconChevronLeft, IconChevronRight, IconClose } from './icons';
import { StampLayer } from './StampLayer';
import { SignatureSheet } from './SignatureSheet';
import { loadSignature, type SavedSignature } from '../signature/storage';

interface Props {
  /** Visible pages in grid order; the arrows walk this list. */
  pageIds: string[];
  /** Injectable for tests. */
  render?: typeof renderPage;
  /** Its miniature is shown while the sharp render loads. */
  cache?: ThumbnailCache;
}

/** A touch hold opens the preview under the finger; the click that follows the touchend must not hit it. */
const GHOST_CLICK_MS = 400;
const noSubscribe = () => () => {};

/** Long side of the sharp render: enough for the screen at its pixel density, bounded for iOS memory. */
function previewMaxSide(): number {
  const screenSide = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
  return Math.round(Math.min(2400, Math.max(1600, screenSide)));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );
}

/** Full-screen view of one page, rotated the way it will be saved. */
export function PagePreview({ pageIds, render = renderPage, cache }: Props) {
  const { previewId, doc, sources, rotate, closePreview, openPreview, addStamp } = useAppStore();
  const [signing, setSigning] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const page = previewId === null ? undefined : doc.pages.find((p) => p.id === previewId);
  const index = previewId === null ? -1 : pageIds.indexOf(previewId);
  const open = page !== undefined && index >= 0;
  const source = page ? sources.get(page.source.fileId) : undefined;
  const sourceRef = page?.source;
  const look = page?.filter;
  const pageId = open ? page.id : null;

  const [full, setFull] = useState<{ id: string; url: string } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Sharp render of the shown page. A result for a page the user already left is dropped, and the
  // canvas is released as soon as it became an image (iOS memory).
  useEffect(() => {
    if (pageId === null || !source || !sourceRef) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await render(source, sourceRef, previewMaxSide());
        if (cancelled) return;
        applyCanvasFilter(canvas, look);
        const blob = await canvasToBlob(canvas);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFull({ id: pageId, url });
      } catch {
        // keep showing the miniature
      } finally {
        if (canvas) releaseCanvas(canvas);
      }
    })();
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
        const revoked = url;
        setFull((cur) => (cur?.url === revoked ? null : cur));
      }
    };
  }, [pageId, source, sourceRef, look, render]);

  const prevId = index > 0 ? pageIds[index - 1] : null;
  const nextId = index >= 0 && index < pageIds.length - 1 ? pageIds[index + 1] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
      else if (e.key === 'ArrowLeft' && prevId) openPreview(prevId);
      else if (e.key === 'ArrowRight' && nextId) openPreview(nextId);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, prevId, nextId, closePreview, openPreview]);

  const thumb = useSyncExternalStore(
    (cb) => (cache && pageId !== null ? cache.subscribe(pageId, cb) : noSubscribe()),
    () => (cache && pageId !== null ? cache.get(pageId) : undefined),
  );

  const wasOpen = useRef(false);
  const openedAt = useRef(0);
  const guarded = (fn: () => void) => () => {
    if (Date.now() - openedAt.current >= GHOST_CLICK_MS) fn();
  };
  useEffect(() => {
    if (open && !wasOpen.current) {
      openedAt.current = Date.now();
      dialog.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  /** Puts the signature in the lower right part of the page, 35 % of its width. */
  const place = (sig: SavedSignature) => {
    const box = imgRef.current?.getBoundingClientRect();
    const pageAspect = box && box.height ? box.width / box.height : 0.707;
    const w = 0.35;
    const h = Math.min(0.5, (w * pageAspect) / sig.aspect);
    addStamp(page.id, { id: crypto.randomUUID(), src: sig.src, x: 0.55, y: Math.max(0, 0.82 - h), w, h });
  };
  const sign = () => {
    const saved = loadSignature();
    if (saved) place(saved);
    else setSigning(true);
  };

  const angle = effectiveRotation(page) + page.skewDeg;
  const sideways = Math.round(angle / 90) % 2 !== 0;
  const src = full?.id === page.id ? full.url : thumb?.status === 'ready' ? thumb.url : null;
  const number = doc.pages.indexOf(page) + 1;

  return (
    <div
      ref={dialog}
      className="preview"
      role="dialog"
      aria-modal="true"
      aria-label={strings.preview(number)}
      tabIndex={-1}
    >
      <div className="preview-bar">
        <button type="button" className="btn btn-icon preview-btn" aria-label={strings.close} onClick={guarded(closePreview)}>
          <IconClose />
        </button>
        <span className="preview-title" aria-hidden="true">
          {strings.page(number)}
        </span>
        <button type="button" className="btn btn-plain preview-rotate" onClick={guarded(sign)}>
          {strings.sign}
        </button>
        <button type="button" className="btn btn-plain preview-rotate" onClick={guarded(() => rotate([page.id], 90))}>
          {strings.rotate}
        </button>
      </div>
      <div className="preview-stage" ref={stageRef}>
        {src && (
          <img
            ref={imgRef}
            className={sideways ? 'preview-img sideways' : 'preview-img'}
            src={src}
            alt=""
            draggable={false}
            style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
          />
        )}
        <StampLayer page={page} img={imgRef} stage={stageRef} />
      </div>
      {signing && (
        <SignatureSheet
          onClose={() => setSigning(false)}
          onSaved={(sig) => {
            setSigning(false);
            place(sig);
          }}
        />
      )}
      <button
        type="button"
        className="btn btn-icon preview-nav preview-prev"
        aria-label={strings.previousPage}
        disabled={!prevId}
        onClick={guarded(() => prevId && openPreview(prevId))}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="btn btn-icon preview-nav preview-next"
        aria-label={strings.nextPage}
        disabled={!nextId}
        onClick={guarded(() => nextId && openPreview(nextId))}
      >
        <IconChevronRight />
      </button>
    </div>
  );
}
