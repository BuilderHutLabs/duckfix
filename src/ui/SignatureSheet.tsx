import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { extractInk, trimToInk } from '../signature/extract';
import { cropRgba, inkBox, type PxRect } from '../signature/geometry';
import { SignatureCrop } from './SignatureCrop';
import { saveSignature, type SavedSignature } from '../signature/storage';
import { loadPhoto } from '../scan/warp';
import { releaseCanvas } from '../imaging/render';
import { strings } from './strings';

const PAD_W = 900;
const PAD_H = 360;
const INKS = { blue: '#1a2a6c', black: '#111111' } as const;

function toSignature(data: Uint8ClampedArray, w: number, h: number): SavedSignature | null {
  const t = trimToInk(data, w, h);
  if (!t) return null;
  const c = Object.assign(document.createElement('canvas'), { width: t.width, height: t.height });
  try {
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(t.width, t.height);
    img.data.set(t.data);
    ctx.putImageData(img, 0, 0);
    return { src: c.toDataURL('image/png'), aspect: t.width / t.height };
  } finally {
    releaseCanvas(c);
  }
}

/** "Mój podpis": draw it with a finger or take a photo of it on paper; it is kept on this phone. */
export function SignatureSheet({ onSaved, onClose }: { onSaved(s: SavedSignature): void; onClose(): void }) {
  const [mode, setMode] = useState<'draw' | 'scan'>('draw');
  const [drawn, setDrawn] = useState(false);
  const [ink, setInk] = useState<keyof typeof INKS>('blue');
  const [scanned, setScanned] = useState<SavedSignature | null>(null);
  const [failed, setFailed] = useState(false);
  /** The photo with its ink picked out, waiting for the crop frame. */
  const [photo, setPhoto] = useState<{ url: string; w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<PxRect | null>(null);
  const inkData = useRef<Uint8ClampedArray | null>(null);
  const lastPhoto = useRef<{ url: string; w: number; h: number } | null>(null);
  if (photo) lastPhoto.current = photo;
  const pad = useRef<HTMLCanvasElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAD_W, y: ((e.clientY - r.top) / r.height) * PAD_H };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    last.current = point(e);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = pad.current?.getContext('2d');
    if (!last.current || !ctx) return;
    const p = point(e);
    ctx.strokeStyle = INKS[ink];
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setDrawn(true);
  };
  const up = () => {
    last.current = null;
  };
  const clear = () => {
    pad.current?.getContext('2d')?.clearRect(0, 0, PAD_W, PAD_H);
    setDrawn(false);
  };

  const onPhoto = async (file: File) => {
    setFailed(false);
    setScanned(null);
    try {
      const loaded = await loadPhoto(file);
      try {
        const w = loaded.width;
        const h = loaded.height;
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
        try {
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(loaded.bitmap, 0, 0);
          const ink = extractInk(ctx.getImageData(0, 0, w, h).data, w, h);
          inkData.current = ink;
          // small copy of the photo to crop on (the frame is in full-photo pixels)
          const k = Math.min(1, 1000 / Math.max(w, h));
          const small = Object.assign(document.createElement('canvas'), { width: Math.round(w * k), height: Math.round(h * k) });
          try {
            small.getContext('2d')!.drawImage(loaded.bitmap, 0, 0, small.width, small.height);
            setPhoto({ url: small.toDataURL('image/jpeg', 0.8), w, h });
          } finally {
            releaseCanvas(small);
          }
          setFrame(inkBox(ink, w, h, 0.03) ?? { x: 0, y: 0, w, h });
        } finally {
          releaseCanvas(c);
        }
      } finally {
        loaded.close();
      }
    } catch {
      setFailed(true);
    }
  };

  /** "Przytnij": only the ink inside the frame becomes the signature. */
  const applyCrop = () => {
    if (!photo || !frame || !inkData.current) return;
    const part = cropRgba(inkData.current, photo.w, photo.h, frame);
    const sig = toSignature(part.data, part.width, part.height);
    setFailed(!sig);
    if (sig) {
      setScanned(sig);
      setPhoto(null);
    }
  };
  const recrop = () => {
    // back to the frame on the same photo
    if (!inkData.current || !lastPhoto.current) return;
    setPhoto(lastPhoto.current);
    setScanned(null);
  };
  const save = () => {
    let sig: SavedSignature | null = null;
    if (mode === 'scan') sig = scanned;
    else {
      const ctx = pad.current?.getContext('2d');
      if (ctx) sig = toSignature(ctx.getImageData(0, 0, PAD_W, PAD_H).data, PAD_W, PAD_H);
    }
    if (!sig) return;
    saveSignature(sig);
    onSaved(sig);
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet signature-sheet" role="dialog" aria-modal="true" aria-label={strings.signatureTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.signatureTitle}</h2>
        <div className="segmented" role="group">
          <button type="button" aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>
            {strings.signatureDraw}
          </button>
          <button type="button" aria-pressed={mode === 'scan'} onClick={() => setMode('scan')}>
            {strings.signatureScan}
          </button>
        </div>
        {mode === 'draw' ? (
          <>
            <canvas
              ref={pad}
              className="signature-pad"
              width={PAD_W}
              height={PAD_H}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
            <div className="ink-row">
              <p className="sheet-option-hint">{strings.signatureDrawHint}</p>
              {(['blue', 'black'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="ink-swatch"
                  aria-pressed={ink === k}
                  aria-label={k === 'blue' ? strings.inkBlue : strings.inkBlack}
                  style={{ background: INKS[k] }}
                  onClick={() => setInk(k)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="signature-scan">
            {photo && frame ? (
              <>
                <p className="sheet-option-hint">{failed ? strings.signatureNotFound : strings.signatureCropHint}</p>
                <SignatureCrop src={photo.url} width={photo.w} height={photo.h} frame={frame} onChange={setFrame} />
              </>
            ) : scanned ? (
              <img className="signature-result" src={scanned.src} alt={strings.signature} />
            ) : (
              <p className="sheet-option-hint">{failed ? strings.signatureNotFound : strings.signatureScanHint}</p>
            )}
            <div className="signature-scan-actions">
              {scanned && (
                <button type="button" className="btn" onClick={recrop}>
                  {strings.signatureRecrop}
                </button>
              )}
              <button type="button" className="btn btn-camera" onClick={() => photoInput.current?.click()}>
                {scanned || photo ? strings.cropRetake : strings.takePhoto}
              </button>
            </div>
            <input
              ref={photoInput}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onPhoto(f);
              }}
            />
          </div>
        )}
        <div className="sheet-actions">
          {mode === 'draw' ? (
            <button type="button" className="btn" disabled={!drawn} onClick={clear}>
              {strings.signatureClear}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              {strings.cancel}
            </button>
          )}
          {mode === 'scan' && photo ? (
            <button type="button" className="btn btn-primary" onClick={applyCrop}>
              {strings.signatureCrop}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={mode === 'draw' ? !drawn : !scanned}
              onClick={save}
            >
              {strings.signatureSave}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
