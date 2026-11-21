import { keepSharedFiles, takeSharedFiles } from '../src/share/shared';

/** in-memory stand-in for the Cache API */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      put: async (k: string, r: Response) => void m.set(k, r),
      keys: async () => [...m.keys()].map((url) => ({ url }) as Request),
      match: async (k: string | Request) => m.get(typeof k === 'string' ? k : k.url),
      delete: async (k: string | Request) => m.delete(typeof k === 'string' ? k : k.url),
    } as unknown as Cache;
  };
  return { open, delete: async (n: string) => stores.delete(n) } as unknown as CacheStorage;
}

describe('"Udostępnij do DuckFix"', () => {
  it('files shared from another app are kept by the service worker and picked up once by the app', async () => {
    const caches = fakeCaches();
    const form = new FormData();
    form.append('files', new File(['%PDF'], 'umowa.pdf', { type: 'application/pdf' }));
    form.append('files', new File(['jpg'], 'skan ą.jpg', { type: 'image/jpeg' }));
    form.append('title', 'not a file');
    await keepSharedFiles(caches, 'https://x/duckfix-v2/', form);

    const files = await takeSharedFiles(caches, 'https://x/duckfix-v2/');
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['umowa.pdf', 'application/pdf'],
      ['skan ą.jpg', 'image/jpeg'],
    ]);
    expect(await files[0].text()).toBe('%PDF');
    expect(await takeSharedFiles(caches, 'https://x/duckfix-v2/')).toEqual([]); // taken once
  });

  it('the live app and the test link do not see each other’s shared files', async () => {
    const caches = fakeCaches();
    const form = new FormData();
    form.append('files', new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    await keepSharedFiles(caches, 'https://x/duckfix-v2/', form);
    expect(await takeSharedFiles(caches, 'https://x/duckfix/')).toEqual([]);
  });
});
