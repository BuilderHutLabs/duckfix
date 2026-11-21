import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Box } from '../../model/document';
import { dragCrop, type CropHandle } from '../../signature/geometry';
import type { Rect } from './pageBox';

const CORNERS: CropHandle[] = ['nw', 'ne', 'sw', 'se'];
const WHOLE: Box = { x: 0, y: 0, w: 1, h: 1 };

/** "Kadruj": a frame over the page; corners resize it, the middle moves it. Each drag is committed once. */
export function CropFrame({ rect, crop, onCommit }: { rect: Rect; crop: Box | undefined; onCommit(b: Box): void }) {
  const [live, setLive] = useState<Box | null>(null);
  const box = live ?? crop ?? WHOLE;

  const start = (handle: CropHandle) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const from = crop ?? WHOLE;
    let next = from;
    const move = (ev: PointerEvent) => {
      next = dragCrop(from, handle, (ev.clientX - x0) / rect.width, (ev.clientY - y0) / rect.height, 1, 1, 0.1);
      setLive(next);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLive(null);
      if (next !== from) onCommit(next);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const pct = (v: number) => `${v * 100}%`;
  const place = { left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) };
  return (
    <div className="crop-layer" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <div className="crop-dim" aria-hidden="true">
        <div style={place} />
      </div>
      <div className="crop-frame" style={place} onPointerDown={start('move')}>
        {CORNERS.map((c) => (
          <span key={c} className={`crop-handle ${c}`} data-handle={c} aria-hidden="true" onPointerDown={start(c)} />
        ))}
      </div>
    </div>
  );
}
