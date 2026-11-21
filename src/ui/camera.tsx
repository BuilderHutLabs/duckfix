import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';

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
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext !== false);
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
  const { setScanPhoto } = useAppStore();
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
          onShot={(file) => {
            setLiveOpen(false);
            setScanPhoto(file);
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

/** Full-screen camera inside the app: shutter, torch when the phone has one, the phone's camera as a way out. */
export function LiveCamera({ onClose, onShot, onPhoneCamera }: { onClose(): void; onShot(file: File): void; onPhoneCamera(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'ready' | 'failed'>('starting');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

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

  const toggleTorch = () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    const on = !torch;
    void track
      .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .then(() => setTorch(on))
      .catch(() => setTorch(null));
  };

  const shoot = () => {
    const v = video.current;
    if (!v || busy || !v.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        canvas.width = 0; // free the picture memory at once (iOS)
        setBusy(false);
        if (blob) onShot(new File([blob], `zdjecie-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="live-camera" role="dialog" aria-modal="true" aria-label={strings.cameraTitle}>
      <video ref={video} className="live-camera-video" playsInline muted autoPlay />
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
        <button type="button" className="live-camera-btn" aria-label={strings.close} onClick={onClose}>
          ✕
        </button>
        {torch !== null && (
          <button type="button" className="live-camera-btn" aria-label={strings.cameraTorch} aria-pressed={torch} onClick={toggleTorch}>
            ⚡
          </button>
        )}
      </div>
      <div className="live-camera-bottom">
        <button type="button" className="live-camera-side" onClick={onPhoneCamera}>
          {strings.cameraPhone}
        </button>
        <button
          type="button"
          className="live-camera-shutter"
          aria-label={strings.cameraShoot}
          disabled={state !== 'ready' || busy}
          onClick={shoot}
        />
        <span className="live-camera-side" aria-hidden="true" />
      </div>
    </div>
  );
}
