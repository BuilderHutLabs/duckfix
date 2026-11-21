import { useEffect } from 'react';
import { takeSharedFiles } from './shared';
import { isSinglePhoto } from '../ui/camera';
import type { AppStore } from '../ui/store';

interface LaunchParams {
  files: Array<{ getFile(): Promise<File> }>;
}
type LaunchQueue = { setConsumer(cb: (p: LaunchParams) => void): void };

/** Files from outside the app: "Udostępnij do DuckFix" (share target) and "Otwórz za pomocą" (file handler). */
export function useIncomingFiles(store: AppStore): void {
  useEffect(() => {
    const take = (files: File[]) => {
      if (files.length === 0) return;
      if (isSinglePhoto(files)) store.setScanPhoto(files[0]);
      else void store.open(files);
    };

    const url = new URL(location.href);
    if (url.searchParams.has('shared')) {
      url.searchParams.delete('shared');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      if (typeof caches !== 'undefined') {
        const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
        void takeSharedFiles(caches, scope).then(take, () => {});
      }
    }

    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer((params) => {
      void Promise.all(params.files.map((h) => h.getFile())).then(take, () => {});
    });
  }, [store]);
}
