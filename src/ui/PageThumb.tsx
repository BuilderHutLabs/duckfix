import { memo, useEffect, useRef, useSyncExternalStore, type PointerEvent, type RefObject } from 'react';
import { useFramedBox } from './edit/pageBox';
import { MarksSvg, cropClip } from './edit/MarksSvg';
import { useSortable } from '@dnd-kit/sortable';
import { effectiveRotation, type Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import type { ThumbnailCache } from './thumbnails';
import { isFlagged } from './store';
import { strings } from './strings';

interface Props {
  page: Page;
  /** Position in the whole document (0-based). */
  index: number;
  source: SourceFile | undefined;
  cache: ThumbnailCache;
  selecting: boolean;
  selected: boolean;
  /** Must be stable across renders (React.memo). */
  onTap(pageId: string): void;
  /** Mouse hold opens the preview; stable across renders. Absent in selection mode. */
  onPreview?: (pageId: string) => void;
  /** Inserts files before `index`; stable across renders. */
  onInsertBefore?: (index: number) => void;
}

/** Keeps the displayed angle continuous so 270° → 0° animates as one quarter turn, not three back. */
function useContinuousAngle(target: number): number {
  const angle = useRef<number | null>(null);
  if (angle.current === null) angle.current = target;
  else angle.current += ((((target - angle.current) % 360) + 540) % 360) - 180;
  return angle.current;
}

const MOUSE_HOLD_MS = 500;
const MOUSE_HOLD_SLOP_PX = 8;
/** The swallowed click is only expected right after the release; later clicks are real taps. */
const SWALLOW_MS = 400;

/** Holding the mouse button still for 500 ms opens the preview and swallows the click that follows. */
function useMouseHold(pageId: string, onPreview: ((id: string) => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const swallow = useRef(false);
  const expire = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      stopTimer();
      if (expire.current !== null) clearTimeout(expire.current);
    },
    [],
  );

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!onPreview || e.pointerType !== 'mouse' || e.button !== 0) return;
      stopTimer();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        swallow.current = true;
        onPreview(pageId);
      }, MOUSE_HOLD_MS);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (timer.current === null) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOUSE_HOLD_SLOP_PX) stopTimer();
    },
    cancel() {
      stopTimer();
      if (swallow.current) {
        // no click follows when the button is released elsewhere (e.g. over the preview)
        if (expire.current !== null) clearTimeout(expire.current);
        expire.current = setTimeout(() => {
          swallow.current = false;
        }, SWALLOW_MS);
      }
    },
    /** True once for the click that ends a hold. */
    consumeClick(): boolean {
      const was = swallow.current;
      swallow.current = false;
      return was;
    },
  };
}

/** Memoized: an analysis result changes one page object, so only that thumb re-renders. */
export const PageThumb = memo(function PageThumb({
  page,
  index,
  source,
  cache,
  selecting,
  selected,
  onTap,
  onPreview,
  onInsertBefore,
}: Props) {
  const number = index + 1;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: selecting,
  });
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLElement>(null);
  const thumb = useSyncExternalStore(
    (cb) => cache.subscribe(page.id, cb),
    () => cache.get(page.id),
  );

  // Render the miniature only when it comes near the viewport.
  useEffect(() => {
    if (!source) return;
    const request = () => cache.request(page.id, source, page.source, page.filter ?? 'color');
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return request();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          request();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cache, page.id, page.source, page.filter, source]);

  const hold = useMouseHold(page.id, onPreview);
  const angle = useContinuousAngle(effectiveRotation(page) + page.skewDeg);
  const flagged = isFlagged(page);
  const autoRotated = page.analyzed && page.autoRotation !== null && page.autoRotation !== 0;
  const label = [
    strings.page(number),
    ...page.flags.map((f) => strings.flagLabels[f]),
    autoRotated && strings.autoRotated,
    selected && strings.selected,
  ]
    .filter(Boolean)
    .join(', ');

  const frameStyle = { transform: `rotate(${angle}deg)` };
  const edited = (page.marks?.length ?? 0) > 0 || page.crop !== undefined;
  const pageBox = useFramedBox(box, frame, effectiveRotation(page) + page.skewDeg, edited, thumb?.status);
  const boxStyle = page.crop && pageBox ? { clipPath: cropClip(page.crop, pageBox, pageBox.stageW, pageBox.stageH) } : undefined;
  const cls = ['thumb', flagged && 'flagged', selected && 'selected', isDragging && 'dragging']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setNodeRef}
      className="cell"
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}
    >
      {onInsertBefore && (
        <button type="button" className="insert-btn" aria-label={strings.insertHere} onClick={() => onInsertBefore(index)}>
          <span aria-hidden="true">+</span>
        </button>
      )}
      <button type="button" className={cls} {...attributes} {...listeners} aria-label={label} onClick={() => {
          if (!hold.consumeClick()) onTap(page.id);
        }}
        onPointerDown={hold.onPointerDown}
        onPointerMove={hold.onPointerMove}
        onPointerUp={hold.cancel}
        onPointerLeave={hold.cancel}
        onPointerCancel={hold.cancel}
      >
        <div className="thumb-box" ref={box} style={boxStyle}>
          {thumb?.status === 'ready' ? (
            <img ref={frame as RefObject<HTMLImageElement>} className="thumb-frame" src={thumb.url} style={frameStyle} alt="" draggable={false} />
          ) : thumb?.status === 'error' ? (
            <div className="thumb-error">{strings.thumbError}</div>
          ) : (
            <div ref={frame as RefObject<HTMLDivElement>} className="thumb-frame thumb-pending" style={frameStyle} />
          )}
          {pageBox && page.marks?.length ? (
            <div className="thumb-marks" style={{ left: pageBox.left, top: pageBox.top, width: pageBox.width, height: pageBox.height }}>
              <MarksSvg marks={page.marks} />
            </div>
          ) : null}
        </div>
        <span className="thumb-number" aria-hidden="true">
          {number}
        </span>
        {page.stamps?.[0] && (
          <span className="stamp-chip">
            <img src={page.stamps[0].src} alt={strings.signature} draggable={false} />
          </span>
        )}
        {flagged && (
          <span className="flag-label" aria-hidden="true">
            {strings.flagLabels[page.flags[0]]}
          </span>
        )}
        {autoRotated && (
          <span className="auto-icon" aria-hidden="true" title={strings.autoRotated}>
            ↻
          </span>
        )}
        {selecting && (
          <span className={selected ? 'check on' : 'check'} aria-hidden="true">
            {selected ? '✓' : ''}
          </span>
        )}
      </button>
    </div>
  );
});
