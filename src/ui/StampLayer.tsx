import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Page, Stamp } from '../model/document';
import { useAppStore } from './store';
import { strings } from './strings';
import { snapAngle } from '../signature/geometry';

type Rect = { left: number; top: number; width: number; height: number };
type Box = Pick<Stamp, 'x' | 'y' | 'w' | 'h' | 'rot'>;

/** Where the (rotated) page image sits inside the stage: its bounding box = the saved page. */
function usePageBox(img: RefObject<HTMLImageElement>, stage: RefObject<HTMLDivElement>, key: unknown): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    const measure = () => {
      if (!img.current || !stage.current) return;
      const a = img.current.getBoundingClientRect();
      const b = stage.current.getBoundingClientRect();
      setRect({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
    };
    measure();
    const el = img.current;
    el?.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    // the zoom-in animation of the preview changes the box for a moment
    const t = setTimeout(measure, 400);
    return () => {
      el?.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      clearTimeout(t);
    };
  }, [img, stage, key]);
  return rect;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Signatures on the page in the preview: drag to move, corner to resize, ↻ to turn, × to remove. */
export function StampLayer({ page, img, stage }: { page: Page; img: RefObject<HTMLImageElement>; stage: RefObject<HTMLDivElement> }) {
  const { moveStamp, removeStamp } = useAppStore();
  const rect = usePageBox(img, stage, `${page.id}:${page.rotation}:${page.skewDeg}`);
  const [live, setLive] = useState<{ id: string; box: Box } | null>(null);

  const startDrag = (s: Stamp, kind: 'move' | 'size') => (e: ReactPointerEvent<HTMLElement>) => {
    if (!rect || !rect.width) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const aspect = (s.w * rect.width) / (s.h * rect.height);
    let box: Box = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot };
    const t = ((s.rot ?? 0) * Math.PI) / 180;
    const move = (ev: PointerEvent) => {
      const px = ev.clientX - x0;
      const py = ev.clientY - y0;
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
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLive(null);
      moveStamp(page.id, s.id, box); // one undo step per drag
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
  return (
    <>
      {(page.stamps ?? []).map((s) => {
        const b = live?.id === s.id ? live.box : s;
        return (
          <div
            key={s.id}
            className="stamp"
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
            <button
              type="button"
              className="stamp-remove"
              aria-label={strings.removeSignature}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeStamp(page.id, s.id)}
            >
              ×
            </button>
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
          </div>
        );
      })}
    </>
  );
}
