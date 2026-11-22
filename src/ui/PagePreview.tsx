import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { effectiveRotation } from '../model/document';
import { releaseCanvas, renderPage } from '../imaging/render';
import { applyCanvasFilter } from '../imaging/filter';
import type { ThumbnailCache } from './thumbnails';
import { useAppStore } from './store';
import { strings } from './strings';
import { IconChevronLeft, IconChevronRight, IconClose, IconRedo, IconUndo } from './icons';
import { StampLayer } from './StampLayer';
import { usePageBox } from './edit/pageBox';
import { MarkLayer, moved, type CoverColor, type EditTool } from './edit/MarkLayer';
import { EditTools, type ToolGroup } from './edit/EditTools';
import { MarkBubble } from './edit/MarkBubble';
import { CropFrame } from './edit/CropFrame';
import { cropClip } from './edit/MarksSvg';
import { TextSheet } from './TextSheet';
import { SignatureSheet } from './SignatureSheet';
import { loadSignature, type SavedSignature } from '../signature/storage';
import { MarkTextSheet } from './edit/MarkTextSheet';
import { loadEditStyle, saveEditStyle, type EditStyle } from './edit/style';
import { FONT_FRAC, TICK_FRAC, newTextBox, tickBox, todayText, type MarkSize } from '../edit/text';
import { currentLanguage } from '../i18n';
import type { HighlightColor, InkColor, Mark, Stamp } from '../model/document';

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
/** A sideways finger move longer than this (px), and clearly more sideways than up/down, turns the page. */
const SWIPE_PX = 60;
/** Pinch zoom of the page in Edytuj. */
const MAX_ZOOM = 4;
type Zoom = { z: number; x: number; y: number };
const NO_ZOOM: Zoom = { z: 1, x: 0, y: 0 };

/** Long side of the sharp render: enough for the screen at its pixel density, bounded for iOS memory. */
function previewMaxSide(): number {
  const screenSide = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
  return Math.round(Math.min(2400, Math.max(1600, screenSide)));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92));
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
  const {
    previewId,
    doc,
    sources,
    rotate,
    closePreview,
    openPreview,
    addStamp,
    setCrop,
    addMark,
    updateMark,
    removeMark,
    removeStamp,
    markOnAllPages,
    stampOnAllPages,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAppStore();
  const [signing, setSigning] = useState(false);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<EditTool>(null);
  const [group, setGroup] = useState<ToolGroup>('write');
  const [folded, setFolded] = useState(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  /** Fingers on the page in Edytuj, and the pinch they make once there are two. */
  const fingers = useRef(new Map<number, { x: number; y: number; target: EventTarget | null }>());
  const pinch = useRef<{ d0: number; mx: number; my: number; from: Zoom } | null>(null);
  const pinchDone = useRef(false);
  const callingOff = useRef(false);
  const [coverColor, setCoverColor] = useState<CoverColor>('black');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<EditStyle>(loadEditStyle);
  /** The "Wpisz" sheet: a new text at a tap, or changing a text already on the page. */
  /** The layer over the page where an item's bubble is drawn (not cut by the crop). */
  const [bubbleHost, setBubbleHost] = useState<HTMLDivElement | null>(null);
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
    setFolded(false);
    setZoom(NO_ZOOM);
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
    const id = crypto.randomUUID();
    addStamp(page.id, { id, src: sig.src, x: 0.55, y: Math.max(0, 0.82 - h), w, h });
    setSelectedId(id); // a new signature comes with its handles, ready to be moved
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
    if (next.ink && selected.kind !== 'cover' && selected.kind !== 'highlight') {
      updateMark(page.id, selected.id, { color: next.ink });
    }
    if (next.highlight && selected.kind === 'highlight') {
      updateMark(page.id, selected.id, { color: next.highlight });
    }
    if (next.size && selected.kind === 'text') {
      const h = selected.text.split('\n').length * 1.25 * FONT_FRAC[next.size];
      updateMark(page.id, selected.id, { size: next.size, h, w: Math.min(1 - selected.x, selected.w * (h / selected.h)) });
    } else if (next.size && selected.kind === 'pen') {
      updateMark(page.id, selected.id, { width: next.size });
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
      addMark(page.id, {
        id,
        kind: 'text',
        text,
        color: style.ink,
        size: style.size,
        ...newTextBox(text, style.size, at, pageW, pageH, measureText),
      });
    } else {
      addMark(page.id, { id, kind: tool === 'tick' ? 'check' : 'cross', color: style.ink, ...tickBox(style.size, at, pageW, pageH) });
    }
  };

  const finishWriting = (text: string) => {
    if (!writing) return;
    if ('at' in writing) {
      const id = crypto.randomUUID();
      addMark(page.id, {
        id,
        kind: 'text',
        text,
        color: style.ink,
        size: style.size,
        ...newTextBox(text, style.size, writing.at, pageW, pageH, measureText),
      });
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

  const duplicate = (m: Mark) => {
    const id = crypto.randomUUID();
    addMark(page.id, { ...moved(m, 0.03, 0.03), id } as Mark);
    setSelectedId(id);
  };

  /** A finger swipe sideways on the page (not while editing or zoomed in) shows the next / previous page. */
  const onSwipeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (editing || !e.isPrimary || (e.target !== e.currentTarget && e.target !== imgRef.current)) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onSwipeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId || (window.visualViewport?.scale ?? 1) > 1.01) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && nextId) openPreview(nextId);
    else if (dx > 0 && prevId) openPreview(prevId);
  };

  /** Two fingers zoom and move the page in Edytuj; one finger keeps drawing and placing. */
  const stagePoint = (e: { clientX: number; clientY: number }) => {
    const b = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (b?.left ?? 0), y: e.clientY - (b?.top ?? 0) };
  };
  const pinchState = () => {
    const [a, b] = [...fingers.current.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const onFingerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || e.pointerType === 'mouse') return;
    fingers.current.set(e.pointerId, { ...stagePoint(e), target: e.target });
    if (fingers.current.size === 2) {
      // the first finger had started drawing or placing: that is called off
      for (const [id, f] of fingers.current) {
        if (id !== e.pointerId && f.target) {
          const ev =
            typeof PointerEvent !== 'undefined'
              ? new PointerEvent('pointercancel', { pointerId: id, bubbles: true })
              : Object.assign(new Event('pointercancel', { bubbles: true }), { pointerId: id });
          callingOff.current = true;
          try {
            f.target.dispatchEvent(ev);
          } finally {
            callingOff.current = false;
          }
        }
      }
      const p = pinchState();
      pinch.current = { d0: p.d || 1, mx: p.mx, my: p.my, from: zoom };
      pinchDone.current = true;
    }
    if (pinchDone.current) e.stopPropagation();
  };
  const onFingerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    Object.assign(f, stagePoint(e));
    const st = pinch.current;
    if (st && fingers.current.size === 2) {
      const p = pinchState();
      const z = Math.min(MAX_ZOOM, Math.max(1, (st.from.z * p.d) / st.d0));
      // the point of the page under the fingers stays under them
      const px = (st.mx - st.from.x) / st.from.z;
      const py = (st.my - st.from.y) / st.from.z;
      const w = rect?.stageW ?? 0;
      const h = rect?.stageH ?? 0;
      const x = Math.min(0, Math.max(w * (1 - z), p.mx - px * z));
      const y = Math.min(0, Math.max(h * (1 - z), p.my - py * z));
      setZoom(z < 1.03 ? NO_ZOOM : { z, x, y });
    }
    if (pinchDone.current) e.stopPropagation();
  };
  const onFingerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (callingOff.current || !fingers.current.delete(e.pointerId)) return;
    if (fingers.current.size < 2) pinch.current = null;
    const wasPinch = pinchDone.current;
    if (fingers.current.size === 0) pinchDone.current = false;
    if (wasPinch) e.stopPropagation();
  };

  const duplicateStamp = (s: Stamp) => {
    const id = crypto.randomUUID();
    addStamp(page.id, { ...s, id, x: Math.min(1 - s.w, s.x + 0.03), y: Math.min(1 - s.h, s.y + 0.03) });
    setSelectedId(id);
  };

  const leaveEdit = () => {
    setZoom(NO_ZOOM);
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
        {editing ? (
          <div className="preview-bar-side">
            <button type="button" className="btn btn-icon preview-btn" aria-label={strings.undo} disabled={!canUndo} onClick={undo}>
              <IconUndo />
            </button>
            <button type="button" className="btn btn-icon preview-btn" aria-label={strings.redo} disabled={!canRedo} onClick={redo}>
              <IconRedo />
            </button>
          </div>
        ) : (
          <div className="preview-bar-side">
            <button type="button" className="btn btn-icon preview-btn" aria-label={strings.close} onClick={guarded(closePreview)}>
              <IconClose />
            </button>
          </div>
        )}
        <span className="preview-title" aria-hidden="true">
          {strings.page(number)}
          {pageIds.length > 1 && (
            <small className="preview-count">
              {index + 1} / {pageIds.length}
            </small>
          )}
        </span>
        <div className="preview-bar-side end">
          {editing && (
            <button type="button" className="btn preview-done" onClick={leaveEdit}>
              {strings.editDone}
            </button>
          )}
        </div>
      </div>
      <div
        className="preview-stage"
        ref={stageRef}
        onPointerDown={onSwipeStart}
        onPointerUp={onSwipeEnd}
        onPointerCancel={() => {
          swipe.current = null;
        }}
        onPointerDownCapture={onFingerDown}
        onPointerMoveCapture={onFingerMove}
        onPointerUpCapture={onFingerUp}
        onPointerCancelCapture={onFingerUp}
      >
        <div
          className="preview-zoom"
          style={zoom.z !== 1 ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})` } : undefined}
        >
          {/* the crop cuts the page and what is on it, not the bubble over a selected item */}
          <div
            className="preview-clip"
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
                ink={style.ink}
                highlight={style.highlight}
                penWidth={style.size}
                zoom={zoom.z}
                bubbleHost={bubbleHost}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlace={placeMark}
                onEditText={(m: Extract<Mark, { kind: 'text' }>) => setWriting({ id: m.id, text: m.text })}
                bubble={(m) => (
                  <MarkBubble
                    mark={m}
                    onInk={(ink) => changeStyle({ ink })}
                    onHighlight={(highlight) => changeStyle({ highlight })}
                    onCover={(c) => {
                      setCoverColor(c);
                      updateMark(page.id, m.id, { color: c });
                    }}
                    onSize={(size) => changeStyle({ size })}
                    onEditText={() => m.kind === 'text' && setWriting({ id: m.id, text: m.text })}
                    onDuplicate={() => duplicate(m)}
                    onAllPages={doc.pages.length > 1 ? () => markOnAllPages(page.id, m) : undefined}
                    onRemove={() => {
                      removeMark(page.id, m.id);
                      setSelectedId(null);
                    }}
                  />
                )}
              />
            )}
            <StampLayer
              page={page}
              rect={rect}
              zoom={zoom.z}
              bubbleHost={bubbleHost}
              selectedId={editing ? selectedId : undefined}
              onSelect={editing ? setSelectedId : undefined}
              bubble={(s) => (
                <div className="mark-bubble" role="group" aria-label={strings.selectedItem} onPointerDown={(e) => e.stopPropagation()}>
                  <div className="mark-bubble-row">
                    <button
                      type="button"
                      className="mark-bubble-btn"
                      aria-label={strings.duplicate}
                      title={strings.duplicate}
                      onClick={() => duplicateStamp(s)}
                    >
                      ⧉
                    </button>
                    {doc.pages.length > 1 && (
                      <button type="button" className="mark-bubble-btn wide" onClick={() => stampOnAllPages(page.id, s)}>
                        {strings.onAllPages}
                      </button>
                    )}
                    <button
                      type="button"
                      className="mark-bubble-btn danger"
                      aria-label={strings.removeSignature}
                      title={strings.removeSignature}
                      onClick={() => {
                        removeStamp(page.id, s.id);
                        setSelectedId(null);
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )}
            />
          </div>
          <div className="preview-bubbles" ref={setBubbleHost} />
          {editing && tool === 'crop' && rect && (
            <CropFrame rect={rect} zoom={zoom.z} crop={page.crop} onCommit={(b) => setCrop([page.id], b)} />
          )}
        </div>
        {editing && zoom.z > 1 && (
          <button type="button" className="preview-zoom-reset" onClick={() => setZoom(NO_ZOOM)}>
            {strings.zoomOut} · {zoom.z.toFixed(1)}×
          </button>
        )}
      </div>
      {editing && (
        <EditTools
          tool={tool}
          onTool={(t) => {
            setTool(t);
            setSelectedId(null);
          }}
          group={group}
          onGroup={(g) => {
            if (g !== group) setTool(null);
            setGroup(g);
          }}
          folded={folded}
          onFold={setFolded}
          coverColor={coverColor}
          onCoverColor={setCoverColor}
          ink={style.ink}
          onInk={(ink: InkColor) => changeStyle({ ink })}
          size={style.size}
          onSize={(size: MarkSize) => changeStyle({ size })}
          highlight={style.highlight}
          onHighlight={(highlight: HighlightColor) => changeStyle({ highlight })}
          onSign={sign}
          onCropAll={() =>
            setCrop(
              doc.pages.map((p) => p.id),
              page.crop,
            )
          }
          onCropNone={() => setCrop([page.id], undefined)}
        />
      )}
      {writing && <MarkTextSheet initial={'text' in writing ? writing.text : ''} onDone={finishWriting} onClose={() => setWriting(null)} />}
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
          <div className="preview-actions">
            <button
              type="button"
              className="preview-action"
              onClick={guarded(() => rotate([page.id], 90, () => (rect && rect.height > 0 ? rect.width / rect.height : undefined)))}
            >
              <span className="preview-action-icon" aria-hidden="true">
                ↻
              </span>
              {strings.rotate}
            </button>
            <button type="button" className="preview-action" onClick={guarded(() => setReading(true))}>
              <span className="preview-action-icon" aria-hidden="true">
                Aa
              </span>
              {strings.copyText}
            </button>
            <button type="button" className="preview-action primary" onClick={guarded(() => setEditing(true))}>
              <span className="preview-action-icon" aria-hidden="true">
                ✎
              </span>
              {strings.edit}
            </button>
          </div>
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
