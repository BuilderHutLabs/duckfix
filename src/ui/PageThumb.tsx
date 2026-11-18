import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { effectiveRotation, type Page } from '../model/document';
import type { SourceFile } from '../import/importFiles';
import type { ThumbnailCache } from './thumbnails';
import { isFlagged } from './store';
import { strings } from './strings';

interface Props {
  page: Page;
  number: number;
  source: SourceFile | undefined;
  cache: ThumbnailCache;
  selecting: boolean;
  selected: boolean;
  onTap(): void;
  onInsertBefore?: () => void;
}

/** Keeps the displayed angle continuous so 270° → 0° animates as one quarter turn, not three back. */
function useContinuousAngle(target: number): number {
  const angle = useRef<number | null>(null);
  if (angle.current === null) angle.current = target;
  else angle.current += ((((target - angle.current) % 360) + 540) % 360) - 180;
  return angle.current;
}

export function PageThumb({ page, number, source, cache, selecting, selected, onTap, onInsertBefore }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: selecting,
  });
  const box = useRef<HTMLDivElement>(null);
  const thumb = useSyncExternalStore(
    (cb) => cache.subscribe(page.id, cb),
    () => cache.get(page.id),
  );

  // Render the miniature only when it comes near the viewport.
  useEffect(() => {
    if (!source) return;
    const request = () => cache.request(page.id, source, page.source);
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
  }, [cache, page.id, page.source, source]);

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
        <button type="button" className="insert-btn" aria-label={strings.insertHere} onClick={onInsertBefore}>
          <span aria-hidden="true">+</span>
        </button>
      )}
      <button type="button" className={cls} {...attributes} {...listeners} aria-label={label} onClick={onTap}>
        <div className="thumb-box" ref={box}>
          {thumb?.status === 'ready' ? (
            <img className="thumb-frame" src={thumb.url} style={frameStyle} alt="" draggable={false} />
          ) : thumb?.status === 'error' ? (
            <div className="thumb-error">{strings.thumbError}</div>
          ) : (
            <div className="thumb-frame thumb-pending" style={frameStyle} />
          )}
        </div>
        <span className="thumb-number" aria-hidden="true">
          {number}
        </span>
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
}
