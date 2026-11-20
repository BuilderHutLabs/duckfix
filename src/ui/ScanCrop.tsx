import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { findSheet, loadPhoto, warpToBlob, type Photo } from '../scan/warp';
import { defaultQuad, type Quad } from '../scan/quad';
import { openCamera } from './camera';
import { useAppStore } from './store';
import { strings } from './strings';

/**
 * Full-screen crop step after a camera photo: the detected sheet outline with 4 draggable corners,
 * then the straightened page goes into the document.
 */
export function ScanCrop({ file }: { file: File }) {
  const s = useAppStore();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, scale: 1 });
  /** the photo is handed to a running warp; the warp closes it, not the unmount */
  const handedOff = useRef(false);

  useEffect(() => {
    let alive = true;
    let loaded: Photo | null = null;
    handedOff.current = false;
    void loadPhoto(file)
      .then((p) => {
        loaded = p;
        if (!alive) return p.close();
        setPhoto(p);
        setQuad(findSheet(p) ?? defaultQuad(p.width, p.height));
      })
      .catch(() => {
        if (alive) {
          s.setScanPhoto(null);
          s.showError(strings.errors.unsupported);
        }
      });
    return () => {
      alive = false;
      if (loaded && !handedOff.current) loaded.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // where the photo sits inside the stage (object-fit: contain)
  useEffect(() => {
    if (!photo || !stage.current) return;
    const fit = () => {
      const r = stage.current!.getBoundingClientRect();
      const scale = Math.min(r.width / photo.width, r.height / photo.height) || 1;
      setBox({ scale, left: (r.width - photo.width * scale) / 2, top: (r.height - photo.height * scale) / 2 });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [photo]);

  const drag = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!photo || !stage.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = stage.current!.getBoundingClientRect();
      const x = Math.min(photo.width, Math.max(0, (ev.clientX - r.left - box.left) / box.scale));
      const y = Math.min(photo.height, Math.max(0, (ev.clientY - r.top - box.top) / box.scale));
      setQuad((q) => q && (q.map((p, k) => (k === i ? { x, y } : p)) as Quad));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Straightens the page and adds it; `next` opens the camera again for the following sheet. */
  const accept = (next: boolean) => {
    if (!photo || !quad) return;
    if (next) openCamera(); // straight from the tap: the browser needs the user gesture
    handedOff.current = true;
    const p = photo;
    s.setScanPhoto(null);
    void warpToBlob(p, quad)
      .then((blob) => s.addScan(blob))
      .catch(() => s.showError(strings.genericError))
      .finally(() => p.close());
  };

  const pts = quad?.map((p) => ({ x: box.left + p.x * box.scale, y: box.top + p.y * box.scale }));

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label={strings.cropTitle}>
      <p className="scan-hint">{strings.cropHint}</p>
      <div className="scan-stage" ref={stage}>
        {photo && <img className="scan-photo" src={photo.url} alt="" draggable={false} />}
        {pts && (
          <>
            <svg className="scan-outline" aria-hidden="true">
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
            </svg>
            {pts.map((p, i) => (
              <button
                key={i}
                type="button"
                role="slider"
                aria-label={strings.cropCorner(i + 1)}
                aria-valuenow={Math.round(quad![i].x)}
                aria-valuetext={`${Math.round(quad![i].x)}, ${Math.round(quad![i].y)}`}
                className="scan-handle"
                style={{ left: p.x, top: p.y }}
                onPointerDown={drag(i)}
              />
            ))}
          </>
        )}
      </div>
      <div className="scan-actions">
        <button type="button" className="btn" onClick={() => s.setScanPhoto(null)}>
          {strings.cancel}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            openCamera();
            s.setScanPhoto(null);
          }}
        >
          {strings.cropRetake}
        </button>
        <button type="button" className="btn" disabled={!quad} onClick={() => accept(true)}>
          {strings.cropNext}
        </button>
        <button type="button" className="btn btn-primary" disabled={!quad} onClick={() => accept(false)}>
          {strings.cropDone}
        </button>
      </div>
    </div>
  );
}
