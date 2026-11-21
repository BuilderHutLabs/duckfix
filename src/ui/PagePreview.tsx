import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { effectiveRotation } from '../model/document';
import { releaseCanvas, renderPage } from '../imaging/render';
import { applyCanvasFilter } from '../imaging/filter';
import type { ThumbnailCache } from './thumbnails';
import { useAppStore } from './store';
import { strings } from './strings';
import { IconChevronLeft, IconChevronRight, IconClose } from './icons';
import { StampLayer } from './StampLayer';
import { usePageBox } from './edit/pageBox';
import { MarkLayer, type CoverColor, type EditTool } from './edit/MarkLayer';
import { EditTools } from './edit/EditTools';
import { CropFrame } from './edit/CropFrame';
import { cropClip } from './edit/MarksSvg';
import { TextSheet } from './TextSheet';
import { SignatureSheet } from './SignatureSheet';
import { loadSignature, type SavedSignature } from '../signature/storage';
import { MarkTextSheet } from './edit/MarkTextSheet';
import { loadEditStyle, saveEditStyle, type EditStyle } from './edit/style';
import { FONT_FRAC, TICK_FRAC, newTextBox, tickBox, todayText, type MarkSize } from '../edit/text';
import { currentLanguage } from '../i18n';
import type { InkColor, Mark } from '../model/document';

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

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Width of a line of text in the font marks use (sans-serif); estimated when there is no canvas. */
function measureText(line: string, px: number): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return line.length * 0.55 * px;
  measureCtx.font = `${px}px sans-serif`;
  return measureCtx.measureText(line).width;
}

/** Full-screen view of one page, rotated the way it will be saved. */
export function PagePreview({ pageIds, render = renderPage, cache }: Props) {
  const { previewId, doc, sources, rotate, closePreview, openPreview, addStamp, setCrop, addMark, updateMark } = useAppStore();
  const [signing, setSigning] = useState(false);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<EditTool>(null);
  const [coverColor, setCoverColor] = useState<CoverColor>('black');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<EditStyle>(loadEditStyle);
  /** The "Wpisz" sheet: a new text at a tap, or changing a text already on the page. */
  const [writing, setWriting] = useState<{ at: { x: number; y: number } } | { id: string; text: string } | null>(null);
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

  // another page or a closed preview leaves "Edytuj" (nothing half-made is kept)
  useEffect(() => {
    setEditing(false);
    setTool(null);
    setSelectedId(null);
    setWriting(null);
  }, [pageId]);
  const angleNow = page ? effectiveRotation(page) + page.skewDeg : 0;
  // measured again when the picture changes (miniature → sharp) and when the tool strip takes room
  const thumbStatus = cache && pageId !== null ? cache.get(pageId)?.status : undefined;
  const rect = usePageBox(imgRef, stageRef, angleNow, `${pageId}:${full?.url ?? ''}:${thumbStatus}:${editing}`);
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

  const pageW = rect?.width || 1;
  const pageH = rect?.height || 1;
  const selected = page.marks?.find((m) => m.id === selectedId);

  const changeStyle = (next: Partial<EditStyle>) => {
    const s = { ...style, ...next };
    setStyle(s);
    saveEditStyle(s);
    // a selected text or tick takes the new colour / size at once
    if (!selected) return;
    if (next.ink && (selected.kind === 'text' || selected.kind === 'check' || selected.kind === 'cross')) {
      updateMark(page.id, selected.id, { color: next.ink });
    }
    if (next.size && selected.kind === 'text') {
      const h = selected.text.split('\n').length * 1.25 * FONT_FRAC[next.size];
      updateMark(page.id, selected.id, { size: next.size, h, w: Math.min(1 - selected.x, selected.w * (h / selected.h)) });
    } else if (next.size && (selected.kind === 'check' || selected.kind === 'cross')) {
      const w = TICK_FRAC[next.size];
      updateMark(page.id, selected.id, { w, h: (w * pageW) / pageH });
    }
  };

  const placeMark = (tool: 'write' | 'tick' | 'cross' | 'date', at: { x: number; y: number }) => {
    const id = crypto.randomUUID();
    if (tool === 'write') return setWriting({ at });
    if (tool === 'date') {
      const text = todayText(currentLanguage());
      addMark(page.id, { id, kind: 'text', text, color: style.ink, size: style.size, ...newTextBox(text, style.size, at, pageW, pageH, measureText) });
    } else {
      addMark(page.id, { id, kind: tool === 'tick' ? 'check' : 'cross', color: style.ink, ...tickBox(style.size, at, pageW, pageH) });
    }
    setSelectedId(id);
  };

  const finishWriting = (text: string) => {
    if (!writing) return;
    if ('at' in writing) {
      const id = crypto.randomUUID();
      addMark(page.id, { id, kind: 'text', text, color: style.ink, size: style.size, ...newTextBox(text, style.size, writing.at, pageW, pageH, measureText) });
      setSelectedId(id);
    } else {
      const m = page.marks?.find((x) => x.id === writing.id);
      if (m?.kind === 'text') {
        // same font size, box fitted to the new text
        const size = m.size as MarkSize;
        const fresh = newTextBox(text, size, { x: m.x, y: m.y }, pageW, pageH, measureText);
        const k = m.h / (m.text.split('\n').length * 1.25 * FONT_FRAC[size]);
        updateMark(page.id, m.id, { text, w: Math.min(1 - m.x, fresh.w * k), h: Math.min(1 - m.y, fresh.h * k) });
      }
    }
    setWriting(null);
  };

  const leaveEdit = () => {
    setEditing(false);
    setTool(null);
    setSelectedId(null);
  };

  const angle = angleNow;
  const sideways = Math.round(angle / 90) % 2 !== 0;
  const src = full?.id === page.id ? full.url : thumb?.status === 'ready' ? thumb.url : null;
  const number = doc.pages.indexOf(page) + 1;

  return (
    <div
      ref={dialog}
      className={editing ? 'preview editing' : 'preview'}
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
        {editing ? (
          <button type="button" className="btn btn-plain preview-rotate preview-done" onClick={leaveEdit}>
            {strings.editDone}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-plain preview-rotate" onClick={guarded(() => setReading(true))}>
              {strings.copyText}
            </button>
            <button type="button" className="btn btn-plain preview-rotate" onClick={guarded(() => setEditing(true))}>
              {strings.edit}
            </button>
            <button type="button" className="btn btn-plain preview-rotate" onClick={guarded(() => rotate([page.id], 90))}>
              {strings.rotate}
            </button>
          </>
        )}
      </div>
      <div
        className="preview-stage"
        ref={stageRef}
        style={page.crop && rect && tool !== 'crop' ? { clipPath: cropClip(page.crop, rect, rect.stageW, rect.stageH) } : undefined}
      >
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
        {rect && (
          <MarkLayer
            page={page}
            rect={rect}
            editing={editing && tool !== 'crop'}
            tool={tool}
            coverColor={coverColor}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPlace={placeMark}
            onEditText={(m: Extract<Mark, { kind: 'text' }>) => setWriting({ id: m.id, text: m.text })}
          />
        )}
        <StampLayer page={page} rect={rect} />
        {editing && tool === 'crop' && rect && (
          <CropFrame rect={rect} crop={page.crop} onCommit={(b) => setCrop([page.id], b)} />
        )}
      </div>
      {editing && (
        <EditTools
          tool={tool}
          onTool={(t) => {
            setTool(t);
            setSelectedId(null);
          }}
          coverColor={coverColor}
          onCoverColor={setCoverColor}
          ink={style.ink}
          onInk={(ink: InkColor) => changeStyle({ ink })}
          size={style.size}
          onSize={(size: MarkSize) => changeStyle({ size })}
          onSign={sign}
          onCropAll={() => setCrop(doc.pages.map((p) => p.id), page.crop)}
          onCropNone={() => setCrop([page.id], undefined)}
        />
      )}
      {writing && (
        <MarkTextSheet
          initial={'text' in writing ? writing.text : ''}
          onDone={finishWriting}
          onClose={() => setWriting(null)}
        />
      )}
      {reading && <TextSheet pageId={page.id} onClose={() => setReading(false)} />}
      {signing && (
        <SignatureSheet
          onClose={() => setSigning(false)}
          onSaved={(sig) => {
            setSigning(false);
            place(sig);
          }}
        />
      )}
      {!editing && (
        <>
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
        </>
      )}
    </div>
  );
}
