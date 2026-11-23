import { useEffect, useRef } from 'react';

/**
 * The phone's Back (Android button or gesture, Safari's edge swipe) closes what is open on top —
 * a sheet, then the page preview, then the document — instead of leaving the app. Each open layer
 * adds one step to the browser history; Back takes it off and the layer closes. A layer closed by
 * hand takes its own step away, so Back never has to be pressed twice. (An app on the iPhone home
 * screen has no Back: nothing changes there.)
 */
interface Layer {
  /** Closes the layer; false when it stays open (e.g. "Odrzucić zdjęcia?" answered no). */
  close(): boolean | void;
}

const stack: Layer[] = [];
/** Steps taken off by the app itself (a layer closed by hand): their "popstate" is not a Back. */
let ignore = 0;
let installed = false;

function onPop() {
  if (ignore > 0) {
    ignore--;
    return;
  }
  const top = stack.pop();
  if (!top) return;
  if (top.close() === false) {
    // still open: it keeps its step
    stack.push(top);
    window.history.pushState({ duckfix: stack.length }, '');
  }
}

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('popstate', onPop);
}

/** For tests: forget every layer. */
export function resetBackStack(): void {
  stack.length = 0;
  ignore = 0;
}

/**
 * While `active`, Back calls `close` (when this is the top layer). Taking the step away is put off
 * a moment, so a layer mounted again at once (React's StrictMode, a quick re-render) keeps its step
 * instead of losing one and adding another.
 */
export function useBackLayer(active: boolean, close: () => boolean | void): void {
  const latest = useRef(close);
  latest.current = close;
  const layer = useRef<Layer | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) return;
    if (leaving.current !== null && layer.current && stack.includes(layer.current)) {
      clearTimeout(leaving.current); // back at once: the same step stays
      leaving.current = null;
    } else {
      install();
      layer.current = { close: () => latest.current() };
      stack.push(layer.current);
      try {
        window.history.pushState({ duckfix: stack.length }, '');
      } catch {
        /* history unavailable: Back simply does not reach the layer */
      }
    }
    const mine = layer.current;
    return () => {
      leaving.current = setTimeout(() => {
        leaving.current = null;
        const i = stack.indexOf(mine!);
        if (i === -1) return; // closed by Back: its step is already gone
        stack.splice(i, 1);
        ignore++;
        try {
          window.history.back();
        } catch {
          ignore--;
        }
      }, 0);
    };
  }, [active]);
}
