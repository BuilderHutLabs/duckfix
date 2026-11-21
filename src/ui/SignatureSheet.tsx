import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { extractInk, trimToInk } from '../signature/extract';
import { saveSignature, type SavedSignature } from '../signature/storage';
import { loadPhoto } from '../scan/warp';
import { releaseCanvas } from '../imaging/render';
import { strings } from './strings';

const PAD_W = 900;
const PAD_H = 360;
const INK = '#1a2a6c';

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
  const [scanned, setScanned] = useState<SavedSignature | null>(null);
  const [failed, setFailed] = useState(false);
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
    ctx.strokeStyle = INK;
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
    try {
      const photo = await loadPhoto(file);
      try {
        const c = Object.assign(document.createElement('canvas'), { width: photo.width, height: photo.height });
        try {
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(photo.bitmap, 0, 0);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const sig = toSignature(extractInk(img.data, c.width, c.height), c.width, c.height);
          if (sig) setScanned(sig);
          else setFailed(true);
        } finally {
          releaseCanvas(c);
        }
      } finally {
        photo.close();
      }
    } catch {
      setFailed(true);
    }
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
            <p className="sheet-option-hint signature-hint">{strings.signatureDrawHint}</p>
          </>
        ) : (
          <div className="signature-scan">
            {scanned ? (
              <img className="signature-result" src={scanned.src} alt={strings.signature} />
            ) : (
              <p className="sheet-option-hint">{failed ? strings.signatureNotFound : strings.signatureScanHint}</p>
            )}
            <button type="button" className="btn btn-camera" onClick={() => photoInput.current?.click()}>
              {scanned ? strings.cropRetake : strings.takePhoto}
            </button>
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={mode === 'draw' ? !drawn : !scanned}
            onClick={save}
          >
            {strings.signatureSave}
          </button>
        </div>
      </div>
    </div>
  );
}
