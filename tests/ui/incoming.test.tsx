import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { createAppStore } from '../../src/ui/store';
import { strings } from '../../src/ui/strings';
import { keepSharedFiles } from '../../src/share/shared';
import { fakeDeps } from './fixtures';

vi.mock('../../src/scan/warp', () => ({
  loadPhoto: vi.fn(async () => ({ width: 400, height: 300, url: 'blob:p', bitmap: {}, close: vi.fn() })),
  findSheet: vi.fn(() => null),
  warpPreview: vi.fn(async () => 'blob:pv'),
  warpToBlob: vi.fn(async () => new Blob(['j'])),
}));

function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        put: async (k: string, r: Response) => void m.set(k, r),
        keys: async () => [...m.keys()].map((url) => ({ url }) as Request),
        match: async (k: Request) => m.get(k.url),
      };
    },
    delete: async (n: string) => stores.delete(n),
  } as unknown as CacheStorage;
}

const scope = () => new URL(import.meta.env.BASE_URL, location.origin).href;

describe('files shared to DuckFix from another app', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
  });

  it('a shared PDF opens straight away and the address is cleaned up', async () => {
    const caches = memoryCaches();
    vi.stubGlobal('caches', caches);
    const form = new FormData();
    form.append('files', new File(['%PDF'], 'faktura.pdf', { type: 'application/pdf' }));
    await keepSharedFiles(caches, scope(), form);
    history.replaceState(null, '', '/?shared=1');
    const deps = fakeDeps();
    render(<App store={createAppStore(deps)} />);
    await waitFor(() => expect(deps.importFiles).toHaveBeenCalledTimes(1));
    expect(vi.mocked(deps.importFiles).mock.calls[0][0][0].name).toBe('faktura.pdf');
    expect(location.search).toBe('');
  });

  it('a single shared photo goes through the crop screen', async () => {
    const caches = memoryCaches();
    vi.stubGlobal('caches', caches);
    const form = new FormData();
    form.append('files', new File(['jpg'], 'IMG.jpg', { type: 'image/jpeg' }));
    await keepSharedFiles(caches, scope(), form);
    history.replaceState(null, '', '/?shared=1');
    render(<App store={createAppStore(fakeDeps())} />);
    expect(await screen.findByRole('dialog', { name: strings.cropTitle })).toBeTruthy();
  });
});
