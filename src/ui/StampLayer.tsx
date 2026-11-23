import { loupeAt, loupeOff } from './loupe';
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { PageBox, Rect } from './edit/pageBox';
import { BUBBLE_GAP, BubbleAnchor, bubblePlace } from './edit/MarkLayer';
import type { Page, Stamp } from '../model/document';
import { useAppStore } from './store';
import { strings } from './strings';
import { snapAngle } from '../signature/geometry';

type Box = Pick<Stamp, 'x' | 'y' | 'w' | 'h' | 'rot'>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Signatures on the page in the preview: drag to move, corner to resize, ↻ to turn, × to remove.
 * In "Edytuj" (`onSelect` given) the handles show only on the touched signature, with a bubble instead of ×.
 */
export function StampLayer({
  page,
  rect,
  zoom = 1,
  selectedId,
  onSelect,
  passive,
  bubble,
  bubbleHost,
}: {
  page: Page;
  rect: Rect | PageBox | null;
  zoom?: number;
  selectedId?: string | null;
  onSelect?(id: string): void;
  /** A tool is chosen in "Edytuj": signatures other than the selected one let the finger through. */
  passive?: boolean;
  bubble?(s: Stamp): ReactNode;
  /** Where the bubble is drawn (outside the crop clip). */
  bubbleHost?: HTMLElement | null;
}) {
  const { moveStamp, removeStamp } = useAppStore();
  const [live, setLive] = useState<{ id: string; box: Box } | null>(null);

  const startDrag = (s: Stamp, kind: 'move' | 'size') => (e: ReactPointerEvent<HTMLElement>) => {
    if (!rect || !rect.width) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(s.id);
    const el = e.currentTarget;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // a pointer the browser no longer tracks
    }
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const aspect = (s.w * rect.width) / (s.h * rect.height);
    let box: Box = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot };
    const t = ((s.rot ?? 0) * Math.PI) / 180;
    const move = (ev: PointerEvent) => {
      if (onSelect) loupeAt(ev); // only while editing
      const px = (ev.clientX - x0) / zoom;
      const py = (ev.clientY - y0) / zoom;
      if (Math.hypot(px, py) > 3) moved = true;
      if (kind === 'move') {
        const dx = px / rect.width;
        const dy = py / rect.height;
        box = { ...box, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
      } else {
        // a turned signature grows along its own width
        const w = clamp(s.w + (px * Math.cos(t) + py * Math.sin(t)) / rect.width, 0.05, 1 - s.x);
        const h = (w * rect.width) / aspect / rect.height;
        box = { x: s.x, y: s.y, w, h: Math.min(h, 1 - s.y), rot: s.rot };
      }
      setLive({ id: s.id, box });
    };
    const up = () => {
      loupeOff();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLive(null);
      if (moved) moveStamp(page.id, s.id, box); // one undo step per drag
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Turn handle: drag around the signature to turn it freely, tap to turn it 90° clockwise. */
  const startRotate = (s: Stamp) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const c = el.parentElement!.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const base = s.rot ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let rot = base;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      rot = snapAngle(base + ((a - a0) * 180) / Math.PI);
      setLive({ id: s.id, box: { x: s.x, y: s.y, w: s.w, h: s.h, rot } });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLive(null);
      if (!moved) rot = snapAngle(Math.floor(base / 90) * 90 + 90);
      if (rot !== base) moveStamp(page.id, s.id, { rot });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const r = rect ?? { left: 0, top: 0, width: 0, height: 0 };
  const editing = onSelect !== undefined;
  const chosen = editing ? (page.stamps ?? []).find((s) => s.id === selectedId) : undefined;
  return (
    <>
      {(page.stamps ?? []).map((s) => {
        const b = live?.id === s.id ? live.box : s;
        const handles = !editing || s.id === selectedId;
        return (
          <div
            key={s.id}
            className={handles ? 'stamp' : passive ? 'stamp quiet passive' : 'stamp quiet'}
            style={{
              left: r.left + b.x * r.width,
              top: r.top + b.y * r.height,
              width: b.w * r.width,
              height: b.h * r.height,
              transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
            }}
            onPointerDown={startDrag(s, 'move')}
          >
            <img src={s.src} alt={strings.signature} draggable={false} />
            {!editing && (
              <button
                type="button"
                className="stamp-remove"
                aria-label={strings.removeSignature}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeStamp(page.id, s.id)}
              >
                ×
              </button>
            )}
            {handles && (
              <>
                <span className="stamp-resize" aria-hidden="true" onPointerDown={startDrag(s, 'size')} />
                <button
                  type="button"
                  className="stamp-rotate"
                  aria-label={strings.rotateSignature}
                  title={strings.rotateSignature}
                  onPointerDown={startRotate(s)}
                >
                  ↻
                </button>
              </>
            )}
          </div>
        );
      })}
      {chosen && bubble && rect && 'stageW' in rect && !live && (
        <BubbleAnchor
          at={bubblePlace(chosen, rect, zoom, BUBBLE_GAP.stamp)}
          zoom={zoom}
          shift={{ x: rect.left, y: rect.top }}
          host={bubbleHost}
        >
          {bubble(chosen)}
        </BubbleAnchor>
      )}
    </>
  );
}
