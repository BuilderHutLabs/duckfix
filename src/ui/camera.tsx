import { useEffect, useRef } from 'react';
import { useAppStore } from './store';

/**
 * One photo picked anywhere (Android offers the camera in every file chooser) goes through the crop
 * screen; PDFs and several files at once are added as they are.
 */
export function isSinglePhoto(files: File[]): boolean {
  return files.length === 1 && (files[0].type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(files[0].name));
}

/** The one hidden camera input of the app; buttons open it with openCamera(). */
let cameraInput: HTMLInputElement | null = null;

/** Opens the phone's rear camera (a file chooser on a computer). Call it straight from a tap. */
export function openCamera(): void {
  cameraInput?.click();
}

export function CameraInput() {
  const { setScanPhoto } = useAppStore();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    cameraInput = ref.current;
    return () => {
      if (cameraInput === ref.current) cameraInput = null;
    };
  }, []);
  return (
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
  );
}
