/**
 * "Udostępnij do DuckFix": the share sheet of another app POSTs the files to the service worker,
 * which keeps them in a cache until the app (opened right after) takes them. The cache name holds
 * the app's scope, so the live app and the duckfix-v2 test link never see each other's files.
 */
const cacheName = (scope: string) => `duckfix-shared:${scope}`;

export async function keepSharedFiles(caches: CacheStorage, scope: string, form: FormData): Promise<number> {
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
  await caches.delete(cacheName(scope)); // only the latest share counts
  const cache = await caches.open(cacheName(scope));
  await Promise.all(
    files.map(async (f, i) =>
      cache.put(
        `${scope}__shared/${i}`,
        new Response(await f.arrayBuffer(), { headers: { 'content-type': f.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name) } }),
      ),
    ),
  );
  return files.length;
}

export async function takeSharedFiles(caches: CacheStorage, scope: string): Promise<File[]> {
  const cache = await caches.open(cacheName(scope));
  const keys = [...(await cache.keys())].sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }));
  const files: File[] = [];
  for (const key of keys) {
    const res = await cache.match(key);
    if (!res) continue;
    const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'plik');
    files.push(new File([await res.arrayBuffer()], name, { type: res.headers.get('content-type') ?? '' }));
  }
  await caches.delete(cacheName(scope));
  return files;
}
