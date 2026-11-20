// Keys the inline start-up script in index.html reads before first paint.
const INLINE_KEYS = ['wduck-theme', 'duckfix-palette'];

/** Rewrites those quoted keys to `${ns}:key` (see src/config.ts); no-op without a namespace. */
export function namespaceHtml(html, ns) {
  if (!ns) return html;
  return INLINE_KEYS.reduce((out, key) => out.replaceAll(`'${key}'`, `'${ns}:${key}'`), html);
}
