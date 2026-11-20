import { namespaceHtml } from '../scripts/html-ns.mjs';

describe('build namespace (duckfix-v2 test link)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('default build keeps the live app keys', async () => {
    vi.stubEnv('VITE_STORAGE_NS', '');
    const { storageKey, IDB_NAME } = await import('../src/config');
    expect(storageKey('wduck-theme')).toBe('wduck-theme');
    expect(IDB_NAME).toBe('wduck');
  });

  it('namespaced build gets its own keys and database', async () => {
    vi.stubEnv('VITE_STORAGE_NS', 'duckfix-v2');
    const { storageKey, IDB_NAME } = await import('../src/config');
    expect(storageKey('wduck-theme')).toBe('duckfix-v2:wduck-theme');
    expect(IDB_NAME).not.toBe('wduck');
  });

  it('the inline start-up script in index.html reads the namespaced keys', () => {
    const html = `<script>localStorage.getItem('wduck-theme'); localStorage.getItem('duckfix-palette');</script>`;
    expect(namespaceHtml(html, '')).toBe(html);
    const out = namespaceHtml(html, 'duckfix-v2');
    expect(out).toContain("'duckfix-v2:wduck-theme'");
    expect(out).toContain("'duckfix-v2:duckfix-palette'");
  });
});
