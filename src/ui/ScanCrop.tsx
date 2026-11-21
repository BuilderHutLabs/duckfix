import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { findSheet, loadPhoto, warpPreview, warpToBlob, type Photo } from '../scan/warp';
import { defaultQuad, type Quad } from '../scan/quad';
import { openCamera } from './camera';
import { storageKey } from '../config';
import type { ScanFilter } from '../scan/enhance';

const FILTER_KEY = storageKey('duckfix-scan-filter');
const FILTERS: ScanFilter[] = ['color', 'whiten', 'bw'];

function loadFilter(): ScanFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY) as ScanFilter | null;
    return v && FILTERS.includes(v) ? v : 'whiten';
  } catch {
    return 'whiten';
  }
}

function saveFilter(f: ScanFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, f);
  } catch {
    /* private mode */
  }
}
import { useAppStore } from './store';
import { strings } from './strings';

/** Straightening runs one page at a time, so pages land in the order they were accepted. */
let warpChain: Promise<unknown> = Promise.resolve();
function queueWarp(job: () => Promise<unknown>): void {
  warpChain = warpChain.then(job, job);
}

/**
 * Full-screen crop step after a camera photo: the detected sheet outline with 4 draggable corners,
 * then the straightened page goes into the document.
 */
export function ScanCrop({ file }: { file: File }) {
  const s = useAppStore();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [filter, setFilter] = useState<ScanFilter>(loadFilter);
  const [preview, setPreview] = useState<string | null>(null);
  /** corners while a finger is dragging; the preview waits for the drop */
  const [dragging, setDragging] = useState(false);
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

  // preview of the straightened page with the chosen look (after a drag ends, not on every move)
  useEffect(() => {
    if (!photo || !quad || dragging) return;
    let alive = true;
    let made: string | null = null;
    const t = setTimeout(() => {
      void warpPreview(photo, quad, filter)
        .then((url) => {
          made = url;
          if (alive) setPreview(url);
          else URL.revokeObjectURL(url);
        })
        .catch(() => {});
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
      if (made) {
        const old = made;
        setTimeout(() => URL.revokeObjectURL(old), 1000); // after the next preview replaced it
      }
    };
  }, [photo, quad, filter, dragging]);

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
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const r = stage.current!.getBoundingClientRect();
      const x = Math.min(photo.width, Math.max(0, (ev.clientX - r.left - box.left) / box.scale));
      const y = Math.min(photo.height, Math.max(0, (ev.clientY - r.top - box.top) / box.scale));
      setQuad((q) => q && (q.map((p, k) => (k === i ? { x, y } : p)) as Quad));
    };
    const up = () => {
      setDragging(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Straightens this photo with the corners as set and adds it (in turn with the others). */
  const addThis = (at: number | null) => {
    if (!photo || !quad) return;
    handedOff.current = true;
    const p = photo;
    const q = quad;
    queueWarp(() =>
      warpToBlob(p, q, filter)
        .then((blob) => s.addScan(blob, at))
        .catch(() => s.showError(strings.genericError))
        .finally(() => p.close()),
    );
  };

  /** Straightens the page and adds it; `next` opens the camera again for the following sheet. */
  const accept = (next: boolean) => {
    if (!photo || !quad) return;
    if (next) openCamera(); // straight from the tap: the browser needs the user gesture
    addThis(s.scanIndex);
    s.nextScan(true); // the next photo of the round, or the end
  };

  /** This photo and all the waiting ones are added with the outline found in each. */
  const addAll = () => {
    if (!photo || !quad) return;
    const start = s.scanIndex;
    addThis(start);
    s.scanQueue.forEach((file, i) => {
      const at = start === null ? null : start + i + 1;
      queueWarp(async () => {
        const p = await loadPhoto(file);
        try {
          await s.addScan(await warpToBlob(p, findSheet(p) ?? defaultQuad(p.width, p.height), filter), at);
        } finally {
          p.close();
        }
      });
    });
    s.setScanPhoto(null);
  };

  const round = s.scanTotal > 1;
  const waiting = s.scanQueue.length > 0;
  const position = s.scanTotal - s.scanQueue.length;

  const pts = quad?.map((p) => ({ x: box.left + p.x * box.scale, y: box.top + p.y * box.scale }));

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label={strings.cropTitle}>
      <p className="scan-hint">
        {round && <strong className="scan-count">{strings.cropPageOf(position, s.scanTotal)}</strong>}
        {strings.cropHint}
      </p>
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
        {preview && <img className="scan-preview" src={preview} alt={strings.cropPreview} />}
      </div>
      <div className="segmented scan-filters" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              saveFilter(f);
            }}
          >
            {{ color: strings.filterColor, whiten: strings.filterWhiten, bw: strings.filterBw }[f]}
          </button>
        ))}
      </div>
      <div className="scan-actions">
        {round ? (
          <>
            <button type="button" className="btn" onClick={() => s.nextScan(false)}>
              {strings.cropSkip}
            </button>
            {waiting && (
              <button type="button" className="btn" disabled={!quad} onClick={addAll}>
                {strings.cropAddAll}
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={!quad} onClick={() => accept(false)}>
              {waiting ? strings.cropNextQueued : strings.cropDone}
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
