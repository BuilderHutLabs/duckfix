import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';
import { useBackLayer } from './backStack';

/** A drag down of at least this much of the sheet's height closes it… */
const CLOSE_PART = 0.25;
/** …or a quick flick down (px per ms). */
const FLICK = 0.6;
/** Below this the finger is still deciding: a tap, a scroll or a drag. */
const SLOP = 10;
/** Where a drag never starts: typing, drawing, sliders, crop frames. */
const NO_DRAG = 'input, textarea, select, canvas, [role="slider"], [contenteditable="true"], .sig-crop, .no-sheet-drag';

/**
 * Closing a bottom sheet by tapping beside it, or by dragging it down. Only a tap that also
 * *started* on the backdrop counts: on a phone the click that follows the tap which opened the sheet
 * lands on its fresh backdrop (the sheet is under the finger by then) and must not close it at once.
 * A drag down starts on the top of the sheet (grabber, title), or anywhere in it when its content is
 * scrolled to the top; the sheet follows the finger and closes when let go far or fast enough.
 */
export function useBackdropClose(onClose: () => void) {
  const down = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useBackLayer(true, () => close.current()); // the phone's Back closes the sheet
  const detach = useRef<(() => void) | null>(null);

  const ref = useCallback((backdrop: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!backdrop) return;

    let start: { y: number; x: number; t: number; sheet: HTMLElement; top: boolean } | null = null;
    let dragging = false;
    let dy = 0;

    const reset = (sheet: HTMLElement) => {
      sheet.style.transition = 'transform 0.2s ease';
      sheet.style.transform = '';
      window.setTimeout(() => (sheet.style.transition = ''), 220);
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      dragging = false;
      const target = e.target as Element | null;
      const t = e.touches[0];
      // only this sheet (a sheet opened over it has its own backdrop)
      if (!t || !target || target.closest('.sheet-backdrop') !== backdrop) return;
      const sheet = target.closest('.sheet') as HTMLElement | null;
      if (!sheet || target.closest(NO_DRAG)) return;
      start = { y: t.clientY, x: t.clientX, t: Date.now(), sheet, top: !!target.closest('.sheet-grabber, .sheet-title') };
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!dragging) {
        if (Math.abs(dx) > SLOP && Math.abs(dx) >= Math.abs(dy)) return void (start = null); // sideways: not ours
        if (dy < -SLOP) return void (start = null); // up: scrolling
        if (dy <= SLOP) return;
        if (!start.top && start.sheet.scrollTop > 0) return void (start = null); // scrolling the content back up
        dragging = true;
        start.sheet.style.transition = 'none';
      }
      e.preventDefault(); // the sheet moves, the page does not scroll
      start.sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const onEnd = () => {
      const s = start;
      start = null;
      if (!s || !dragging) return;
      dragging = false;
      const speed = dy / Math.max(1, Date.now() - s.t);
      if (dy > s.sheet.offsetHeight * CLOSE_PART || speed > FLICK) {
        s.sheet.style.transition = 'transform 0.18s ease-in';
        s.sheet.style.transform = 'translateY(100%)';
        // the click that may follow the finger must not tap what is under it
        const swallow = (ev: Event) => ev.stopPropagation();
        backdrop.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => {
          backdrop.removeEventListener('click', swallow, { capture: true });
          close.current();
        }, 180);
      } else reset(s.sheet);
    };

    backdrop.addEventListener('touchstart', onStart, { passive: true });
    backdrop.addEventListener('touchmove', onMove, { passive: false });
    backdrop.addEventListener('touchend', onEnd);
    backdrop.addEventListener('touchcancel', onEnd);
    detach.current = () => {
      backdrop.removeEventListener('touchstart', onStart);
      backdrop.removeEventListener('touchmove', onMove);
      backdrop.removeEventListener('touchend', onEnd);
      backdrop.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return {
    ref,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      down.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const started = down.current;
      down.current = false;
      if (started && e.target === e.currentTarget) onClose();
    },
  };
}
