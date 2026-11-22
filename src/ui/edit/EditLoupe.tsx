import { LOUPE, loupeSpot, useLoupePoint } from '../loupe';

/**
 * The magnifier over the page in "Edytuj": while a finger drags a corner dot, an item or the crop
 * frame, a round window above the finger shows the page under it, larger, with a cross at the spot.
 */
export function EditLoupe({
  stage,
  img,
  zoom,
}: {
  stage: HTMLElement | null;
  img: HTMLImageElement | null;
  zoom: { x: number; y: number; z: number };
}) {
  const point = useLoupePoint();
  if (!point || !stage) return null;
  const r = stage.getBoundingClientRect();
  const sx = point.x - r.left;
  const sy = point.y - r.top;
  // the spot on the unzoomed page, and the scale of the window over the page
  const cx = (sx - zoom.x) / zoom.z;
  const cy = (sy - zoom.y) / zoom.z;
  const k = LOUPE.zoom * zoom.z;
  const s = LOUPE.size;
  const spot = loupeSpot(sx, sy, r.width);
  return (
    <div className="loupe" aria-hidden="true" style={{ left: spot.left, top: spot.top, width: s, height: s }}>
      <div
        className="loupe-content"
        style={{ width: r.width, height: r.height, transform: `translate(${s / 2 - cx * k}px, ${s / 2 - cy * k}px) scale(${k})` }}
      >
        {img && (
          <img
            className={img.className}
            src={img.currentSrc || img.src}
            alt=""
            draggable={false}
            style={{ width: img.offsetWidth || undefined, height: img.offsetHeight || undefined, transform: img.style.transform }}
          />
        )}
      </div>
    </div>
  );
}
