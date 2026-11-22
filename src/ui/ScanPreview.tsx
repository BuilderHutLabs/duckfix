import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { storageKey } from '../config';
import { strings } from './strings';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const KEY = storageKey('duckfix-scan-preview');
/** A finger moving less than this is a tap, not a drag. */
const DRAG_MIN = 6;

/** The corner of a w × h box closest to the point (x, y). */
export function nearestCorner(x: number, y: number, w: number, h: number): Corner {
  return `${y < h / 2 ? 't' : 'b'}${x < w / 2 ? 'l' : 'r'}` as Corner;
}

interface Place {
  corner: Corner;
  folded: boolean;
}

function load(): Place {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Place> | null;
    return { corner: v?.corner && CORNERS.includes(v.corner) ? v.corner : 'tr', folded: v?.folded === true };
  } catch {
    return { corner: 'tr', folded: false };
  }
}

function save(v: Place): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: only for this visit */
  }
}

const IconEye = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * The small preview of the straightened page on the crop screen. It can be dragged to any corner
 * (it jumps to the nearest one when let go) and folded into a small button, so it never hides a
 * corner of the sheet. Where it sits and whether it is folded are remembered.
 */
export function ScanPreview({ src }: { src: string }) {
  const [place, setPlace] = useState(load);
  const [shift, setShift] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const update = (v: Partial<Place>) =>
    setPlace((p) => {
      const next = { ...p, ...v };
      save(next);
      return next;
    });

  const down = (e: ReactPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    ref.current?.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (shift || Math.hypot(x, y) >= DRAG_MIN) setShift({ x, y });
  };
  const up = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    setShift(null);
    const el = ref.current;
    const parent = el?.parentElement;
    if (!s || !el || !parent) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (Math.hypot(x, y) < DRAG_MIN) return; // a tap
    const r = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const cx = r.left + r.width / 2 + x - p.left;
    const cy = r.top + r.height / 2 + y - p.top;
    update({ corner: nearestCorner(cx, cy, p.width || parent.clientWidth, p.height || parent.clientHeight) });
  };

  if (place.folded)
    return (
      <button
        type="button"
        className="scan-preview-show"
        data-corner={place.corner}
        aria-label={strings.previewShow}
        title={strings.previewShow}
        onClick={() => update({ folded: false })}
      >
        <IconEye />
      </button>
    );

  return (
    <div
      ref={ref}
      className={`scan-preview-box${shift ? ' dragging' : ''}`}
      data-corner={place.corner}
      style={shift ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setShift(null);
      }}
    >
      <img className="scan-preview" src={src} alt={strings.cropPreview} draggable={false} />
      <button
        type="button"
        className="scan-preview-hide"
        aria-label={strings.previewHide}
        title={strings.previewHide}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => update({ folded: true })}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
