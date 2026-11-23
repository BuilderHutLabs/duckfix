import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';
import { useBackLayer } from './backStack';
import { storageKey } from '../config';
import { analyzeFrame } from '../scan/liveFrame';
import { createOutline, createSteady, quadToView, type LiveState } from '../scan/liveScan';
import type { Pt } from '../scan/quad';

/**
 * One photo picked anywhere (Android offers the camera in every file chooser) goes through the crop
 * screen; PDFs and several files at once are added as they are.
 */
export function isSinglePhoto(files: File[]): boolean {
  return files.length === 1 && (files[0].type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(files[0].name));
}

/** The one hidden camera input of the app (the phone's own camera app); the fallback of the built-in camera. */
let cameraInput: HTMLInputElement | null = null;

/** Built-in camera open or not; a tiny store so any button can open it. */
let liveOpen = false;
const listeners = new Set<() => void>();
function setLiveOpen(v: boolean) {
  liveOpen = v;
  listeners.forEach((l) => l());
}

/** The browser can show the camera inside the app (needs https and a camera API). */
function hasLiveCamera(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof window === 'undefined' || window.isSecureContext !== false)
  );
}

/**
 * Opens the camera. Call it straight from a tap. Inside the app when the browser can (the page is not
 * left, so Android does not close it to free memory for the camera app); else the phone's camera.
 */
export function openCamera(): void {
  if (hasLiveCamera()) setLiveOpen(true);
  else cameraInput?.click();
}

/** Opens the phone's own camera app (or a file chooser on a computer). */
function openPhoneCamera(): void {
  cameraInput?.click();
}

export function CameraInput() {
  const { setScanPhoto, setScanPhotos } = useAppStore();
  const ref = useRef<HTMLInputElement>(null);
  const open = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => liveOpen,
  );
  useEffect(() => {
    cameraInput = ref.current;
    return () => {
      if (cameraInput === ref.current) cameraInput = null;
      liveOpen = false; // a new app starts with the camera off
    };
  }, []);
  return (
    <>
      <input
        ref={ref}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // the same photo name may come again
          if (file) setScanPhoto(file);
        }}
      />
      {open && (
        <LiveCamera
          onClose={() => setLiveOpen(false)}
          onDone={(files, cardFiles) => {
            setLiveOpen(false);
            setScanPhotos(files, null, cardFiles);
          }}
          onPhoneCamera={() => {
            setLiveOpen(false);
            openPhoneCamera();
          }}
        />
      )}
    </>
  );
}

/** Asked size of the camera picture: as sharp as the camera gives, for readable text. */
const VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } } as const;

type TorchTrack = Omit<MediaStreamTrack, 'getCapabilities'> & { getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean } };

const AUTO_KEY = storageKey('duckfix-auto-shot');
/** How often the live picture is searched for the sheet. */
const LOOK_MS = 200;
/** Below this mean brightness (0–255) the picture is too dark for a good scan. */
const DARK = 55;

/** Auto: outline + picture by itself; Ręcznie: just the shutter; Dowód: front and back of a card, one page. */
type CameraMode = 'auto' | 'manual' | 'card';
const MODES: Array<[CameraMode, () => string]> = [
  ['auto', () => strings.modeAuto],
  ['manual', () => strings.modeManual],
  ['card', () => strings.modeCard],
];

function loadMode(): CameraMode {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === '0' ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}
function saveMode(m: CameraMode): void {
  if (m === 'card') return; // "Dowód" is for this once; the next scan starts as before
  try {
    localStorage.setItem(AUTO_KEY, m === 'manual' ? '0' : '1');
  } catch {
    /* private mode */
  }
}
/** "Dowód" finishes by itself after the back: a moment later, so the flash is seen. */
const CARD_DONE_MS = 450;

function hintFor(state: LiveState, light: number): string {
  if (light < DARK && state !== 'hold' && state !== 'ready') return strings.hintDark;
  return { none: strings.hintFind, far: strings.hintCloser, hold: strings.hintHold, done: strings.hintNext, ready: '' }[state];
}

let shotNo = 0;

/** A photo of the camera row: its small picture now, its full-size file when written. */
interface Shot {
  url: string;
  card: boolean;
  file: Promise<File | null>;
  saved: boolean;
}

/** A small picture of the frame for the counter, made at once (empty where the canvas cannot). */
function thumbnail(frame: HTMLCanvasElement): string {
  try {
    const w = 160;
    const t = document.createElement('canvas');
    t.width = w;
    t.height = Math.max(1, Math.round((frame.height / frame.width) * w));
    const ctx = t.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(frame, 0, 0, t.width, t.height);
    const url = t.toDataURL('image/jpeg', 0.7);
    t.width = 0;
    return url?.startsWith('data:image') ? url : '';
  } catch {
    return '';
  }
}

/** Photos taken in "Ręcznie": the crop screen starts from the whole photo, without looking for the sheet. */
export const takenByHand = new WeakSet<File>();

/**
 * Full-screen camera inside the app. The sheet is outlined live; with "Auto" the picture is taken by
 * itself once the phone is held still. Pages are collected in a row and go to the crop screen on "Gotowe".
 */
export function LiveCamera({
  onClose,
  onDone,
  onPhoneCamera,
}: {
  onClose(): void;
  /** `cardFiles`: the photos that are the front and back of a card (one page together). */
  onDone(files: File[], cardFiles?: File[]): void;
  onPhoneCamera(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'ready' | 'failed'>('starting');
  const [torch, setTorch] = useState<boolean | null>(null);
  /**
   * Photos taken so far. Each counts at the flash, with a small picture; the full-size file is written
   * in the background ("Gotowe" waits for it).
   */
  const [shots, setShots] = useState<Shot[]>([]);
  /** "Gotowe" pressed: waiting for the last photos to be written. */
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  /** The same photos, kept at once (the state shows them on the next render). */
  const taken = useRef<Shot[]>([]);
  /** Photos taken in "Dowód" (the card's sides); earlier ordinary photos are not counted. */
  const cardShots = shots.filter((s) => s.card).length;
  const modeRef = useRef<CameraMode>('auto');
  const [mode, setMode] = useState(loadMode);
  const auto = mode !== 'manual';
  const [live, setLive] = useState<{ pts: Pt[] | null; state: LiveState; progress: number; hint: string }>({
    pts: null,
    state: 'none',
    progress: 0,
    hint: '',
  });
  const [flash, setFlash] = useState(0);
  /** What the live look saw last ("hold": the sheet is in frame, the outline filling up). */
  const liveRef = useRef<LiveState>('none');
  const busy = useRef(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  modeRef.current = mode;

  useEffect(() => {
    let alive = true;
    void navigator.mediaDevices
      .getUserMedia({ video: VIDEO, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          void v.play?.()?.catch?.(() => {});
        }
        const track = s.getVideoTracks()[0] as unknown as TorchTrack | undefined;
        if (track?.getCapabilities?.().torch) setTorch(false);
        setState('ready');
      })
      .catch(() => alive && setState('failed'));
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);


  const shoot = (byItself = false) => {
    const v = video.current;
    if (!v || busy.current || !v.videoWidth) return;
    busy.current = true;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      busy.current = false;
      return;
    }
    ctx.drawImage(v, 0, 0);
    setFlash((f) => f + 1);
    if (byItself) navigator.vibrate?.(40);
    const byHand = !autoRef.current;
    // counted at once with a small picture; the full-size file follows
    const file = new Promise<File | null>((resolve) =>
      canvas.toBlob(
        (blob) => {
          canvas.width = 0; // free the picture memory at once (iOS)
          busy.current = false;
          if (!blob) return resolve(null);
          const f = new File([blob], `zdjecie-${Date.now()}-${++shotNo}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          if (byHand) takenByHand.add(f);
          resolve(f);
        },
        'image/jpeg',
        0.92,
      ),
    );
    const shot: Shot = { url: thumbnail(canvas), card: modeRef.current === 'card', file, saved: false };
    taken.current = [...taken.current, shot];
    void file.then(() => setShots((list) => list.map((x) => (x === shot ? { ...x, saved: true } : x))));
    setShots((list) => [...list, shot]);
  };

  /**
   * "Gotowe": with the sheet held in frame (the outline filling up) that page is taken first; then,
   * once every photo is written, on to the crop screen.
   */
  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    if (autoRef.current && liveRef.current === 'hold' && !busy.current) shootRef.current();
    const list = taken.current;
    const files = await Promise.all(list.map((x) => x.file));
    const kept = list.map((x, i) => ({ card: x.card, file: files[i] })).filter((x): x is { card: boolean; file: File } => !!x.file);
    onDone(
      kept.map((x) => x.file),
      kept.filter((x) => x.card).map((x) => x.file),
    );
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const shootRef = useRef(shoot);
  shootRef.current = shoot;

  // look for the sheet a few times a second: outline, hint, and the picture taken by itself when still
  useEffect(() => {
    if (state !== 'ready' || !auto) {
      setLive({ pts: null, state: 'none', progress: 0, hint: '' });
      return;
    }
    const steady = createSteady();
    const outline = createOutline();
    const look = document.createElement('canvas');
    const t = setInterval(() => {
      const v = video.current;
      if (!v) return;
      let r: ReturnType<typeof analyzeFrame> = null;
      try {
        r = analyzeFrame(v, look);
      } catch {
        return;
      }
      if (!r) return;
      const st = steady.push(r.quad, r.width, r.height, performance.now());
      const shown = outline.push(r.quad, r.width, r.height);
      liveRef.current = st.state;
      setLive({
        pts: shown ? quadToView(shown, r.width, r.height, v.clientWidth, v.clientHeight) : null,
        state: st.state,
        progress: st.progress,
        hint: hintFor(st.state, r.light),
      });
      if (st.state === 'ready' && !busy.current && !finishingRef.current) {
        steady.fired();
        shootRef.current(true);
      }
    }, LOOK_MS);
    return () => {
      clearInterval(t);
      look.width = 0;
    };
  }, [state, auto]);

  // "Dowód": after the front and the back, straight on to the crop screen
  useEffect(() => {
    if (mode !== 'card' || cardShots < 2) return;
    const t = setTimeout(() => void finishRef.current(), CARD_DONE_MS);
    return () => clearTimeout(t);
  }, [mode, cardShots]);

  const toggleTorch = () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    const on = !torch;
    void track
      .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .then(() => setTorch(on))
      .catch(() => setTorch(null));
  };

  const close = () => {
    if (shots.length && !window.confirm(strings.cameraDiscard(shots.length))) return false;
    onClose();
    return true;
  };
  useBackLayer(true, close); // the phone's Back closes the camera (asking first when photos would be lost)

  const last = shots.at(-1);
  const counting = live.state === 'hold' || live.state === 'ready';

  return (
    <div className="live-camera" role="dialog" aria-modal="true" aria-label={strings.cameraTitle}>
      <video ref={video} className="live-camera-video" playsInline muted autoPlay />
      {live.pts && state === 'ready' && (
        <svg className={`live-camera-outline ${live.state}`} aria-hidden="true">
          <polygon points={live.pts.map((p) => `${p.x},${p.y}`).join(' ')} />
          {counting && (
            <polygon
              className="live-camera-progress"
              points={live.pts.map((p) => `${p.x},${p.y}`).join(' ')}
              pathLength={100}
              style={{ strokeDasharray: `${Math.round(live.progress * 100)} 100` }}
            />
          )}
        </svg>
      )}
      {flash > 0 && <div className="live-camera-flash" key={flash} aria-hidden="true" />}
      {state === 'starting' && <p className="live-camera-msg">{strings.cameraStarting}</p>}
      {state === 'failed' && (
        <div className="live-camera-msg">
          <p>{strings.cameraFailed}</p>
          <button type="button" className="btn btn-primary" onClick={onPhoneCamera}>
            {strings.cameraPhone}
          </button>
        </div>
      )}
      <div className="live-camera-top">
        <button type="button" className="live-camera-btn" aria-label={strings.close} onClick={close}>
          ✕
        </button>
        {state === 'ready' && live.hint && (
          <p className="live-camera-hint" role="status">
            {live.hint}
          </p>
        )}
        <div className="live-camera-tools">
          {torch !== null && (
            <button type="button" className="live-camera-btn" aria-label={strings.cameraTorch} aria-pressed={torch} onClick={toggleTorch}>
              ⚡
            </button>
          )}
        </div>
      </div>
      {mode === 'card' && cardShots < 2 && <p className="live-camera-step">{cardShots === 0 ? strings.cardFront : strings.cardBack}</p>}
      <div className="live-camera-modes" role="group">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              saveMode(m);
            }}
          >
            {label()}
          </button>
        ))}
      </div>
      <div className="live-camera-bottom">
        {last ? (
          <span className={`live-camera-thumb${last.saved ? '' : ' saving'}`} key={shots.length}>
            {last.url ? <img src={last.url} alt="" /> : null}
            <span className="live-camera-count">{shots.length}</span>
          </span>
        ) : (
          <button type="button" className="live-camera-side" onClick={onPhoneCamera}>
            {strings.cameraPhone}
          </button>
        )}
        <button
          type="button"
          className="live-camera-shutter"
          aria-label={strings.cameraShoot}
          disabled={state !== 'ready'}
          onClick={() => shoot()}
        />
        {shots.length ? (
          <button type="button" className="live-camera-done" disabled={finishing} onClick={() => void finish()}>
            {finishing ? strings.cameraSaving : strings.cameraDone(shots.length)}
          </button>
        ) : (
          <span className="live-camera-side" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
