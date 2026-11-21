import { useEffect, useState, type RefObject } from 'react';
import { rotatedBox } from '../../export/rasterize';

export type Rect = { left: number; top: number; width: number; height: number };
/** The page box plus the size of the stage it sits in. */
export type PageBox = Rect & { stageW: number; stageH: number };

/**
 * Where the saved page sits in the preview stage. The image element is centred in the stage, its
 * picture drawn with object-fit: contain, then turned by `angleDeg`; the saved page is the bounding
 * box of that turned picture (exactly what the rasterizer saves).
 */
export function pageBoxIn(
  stageW: number,
  stageH: number,
  elW: number,
  elH: number,
  natW: number,
  natH: number,
  angleDeg: number,
): Rect {
  const k = Math.min(elW / natW, elH / natH);
  const box = rotatedBox(natW * k, natH * k, angleDeg);
  return { left: (stageW - box.w) / 2, top: (stageH - box.h) / 2, width: box.w, height: box.h };
}

/** The page box of the preview image, kept up to date (image load, resize, zoom-in animation). */
export function usePageBox(img: RefObject<HTMLImageElement>, stage: RefObject<HTMLDivElement>, angleDeg: number, key: unknown): PageBox | null {
  const [rect, setRect] = useState<PageBox | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = img.current;
      const st = stage.current;
      if (!st) return;
      const s = st.getBoundingClientRect();
      if (!el) {
        // no picture yet: the whole stage
        setRect({ left: 0, top: 0, width: s.width, height: s.height, stageW: s.width, stageH: s.height });
        return;
      }
      if (el.naturalWidth && el.offsetWidth) {
        const box = pageBoxIn(s.width, s.height, el.offsetWidth, el.offsetHeight, el.naturalWidth, el.naturalHeight, angleDeg);
        setRect({ ...box, stageW: s.width, stageH: s.height });
      } else {
        // picture not decoded yet (or no layout, as in tests): the element's own box
        const a = el.getBoundingClientRect();
        setRect({ left: a.left - s.left, top: a.top - s.top, width: a.width, height: a.height, stageW: s.width, stageH: s.height });
      }
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
  }, [img, stage, angleDeg, key]);
  return rect;
}

/**
 * The page box of a miniature: `frame` is the (turned) picture centred in `box`. Measured only when
 * `active` (the page has marks or a crop), again when the picture loads or the window resizes.
 */
export function useFramedBox(
  box: RefObject<HTMLElement>,
  frame: RefObject<HTMLElement>,
  angleDeg: number,
  active: boolean,
  key: unknown,
): PageBox | null {
  const [rect, setRect] = useState<PageBox | null>(null);
  useEffect(() => {
    if (!active) return setRect(null);
    const measure = () => {
      const b = box.current;
      const f = frame.current;
      if (!b || !f) return;
      const s = b.getBoundingClientRect();
      const img = f instanceof HTMLImageElement ? f : null;
      if (img?.naturalWidth && img.offsetWidth) {
        const r = pageBoxIn(s.width, s.height, img.offsetWidth, img.offsetHeight, img.naturalWidth, img.naturalHeight, angleDeg);
        setRect({ ...r, stageW: s.width, stageH: s.height });
      } else {
        const a = f.getBoundingClientRect();
        setRect({ left: a.left - s.left, top: a.top - s.top, width: a.width, height: a.height, stageW: s.width, stageH: s.height });
      }
    };
    measure();
    const f = frame.current;
    f?.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    // the springy quarter turn of the miniature settles after ~0.4 s
    const t = setTimeout(measure, 450);
    return () => {
      f?.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      clearTimeout(t);
    };
  }, [box, frame, angleDeg, active, key]);
  return rect;
}
