import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { dragCrop, type CropHandle, type PxRect } from '../signature/geometry';
import { strings } from './strings';

const CORNERS: CropHandle[] = ['nw', 'ne', 'sw', 'se'];

/** Photo of the signature with a frame: drag the corners (or the middle) to keep only the signature. */
export function SignatureCrop({
  src,
  width,
  height,
  frame,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  frame: PxRect;
  onChange(r: PxRect): void;
}) {
  const stage = useRef<HTMLDivElement>(null);

  const start = (handle: CropHandle) => (e: ReactPointerEvent<HTMLElement>) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const k = width / box.width; // photo pixels per screen pixel
    const x0 = e.clientX;
    const y0 = e.clientY;
    const from = frame;
    const min = Math.max(width, height) * 0.04;
    const move = (ev: PointerEvent) => onChange(dragCrop(from, handle, (ev.clientX - x0) * k, (ev.clientY - y0) * k, width, height, min));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const place = { left: pct(frame.x, width), top: pct(frame.y, height), width: pct(frame.w, width), height: pct(frame.h, height) };
  return (
    // max width keeps the photo's shape when its height is capped
    <div className="sig-crop" ref={stage} style={{ aspectRatio: `${width} / ${height}`, maxWidth: `calc(44vh * ${width / height})` }}>
      <img src={src} alt="" draggable={false} />
      <div className="sig-crop-dim" aria-hidden="true">
        <div style={place} />
      </div>
      <div className="sig-crop-frame" role="group" aria-label={strings.signatureCropHint} style={place} onPointerDown={start('move')}>
        {CORNERS.map((c) => (
          <span key={c} className={`sig-crop-handle ${c}`} data-handle={c} aria-hidden="true" onPointerDown={start(c)} />
        ))}
      </div>
    </div>
  );
}
