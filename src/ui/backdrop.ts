import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Closing a bottom sheet by tapping beside it. Only a tap that also *started* on the backdrop counts:
 * on a phone the click that follows the tap which opened the sheet lands on its fresh backdrop
 * (the sheet is under the finger by then) and must not close it at once.
 */
export function useBackdropClose(onClose: () => void) {
  const down = useRef(false);
  return {
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
